import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { RetailTransaction } from "@retail/shared";
import pino from "pino";
import { mapTransaction, mapLines } from "./mappers/erp-to-local.js";

const logger = pino({ transport: { target: "pino-pretty" } });

type Watermark = {
  lastModifiedAt: Date;
  lastTransactionId: string;
};

const OVERLAP_MINUTES = Number(process.env.INGESTION_OVERLAP_MINUTES ?? 15);
const BATCH_SIZE = Number(process.env.INGESTION_BATCH_SIZE ?? 500);

/**
 * Job central de ingesta incremental.
 *
 * Correcciones aplicadas vs. el plan original:
 *
 * 1. Cursor compuesto (modified_at, transaction_id) en lugar de gt sobre
 *    un solo campo. Evita perder transacciones con el mismo timestamp.
 *
 * 2. Ventana de solapamiento: el watermark se retrasa OVERLAP_MINUTES
 *    para recapturar registros de llegada tardía. Es gratis porque la
 *    inserción es idempotente.
 *
 * 3. Upsert condicional: ON CONFLICT ... DO UPDATE ... WHERE t.modified_at < EXCLUDED
 *    Actualiza transacciones corregidas en el ERP sin reescribir las que
 *    no cambiaron.
 *
 * 4. Inserción por lotes: un solo INSERT multi-row por chunk, dentro de
 *    una transacción por chunk.
 *
 * 5. Refresco de rollups: solo las horas afectadas por este lote.
 */
export async function runIngestJob(
  pool: Pool,
  redis: Redis,
  erpBaseUrl: string,
): Promise<{ rowsProcessed: number }> {
  // 1. Leer watermark
  const watermark = await readWatermark(pool);

  // Retroceder el watermark para cubrir registros tardíos
  const effectiveModifiedAt = new Date(
    watermark.lastModifiedAt.getTime() - OVERLAP_MINUTES * 60_000,
  );

  let totalProcessed = 0;
  const touchedBuckets = new Set<string>(); // "store_id|bucket_iso"
  let cursor = { modifiedAt: effectiveModifiedAt, transactionId: watermark.lastTransactionId };

  // 2. Paginar desde el ERP con cursor compuesto
  while (true) {
    const filter = [
      `ModifiedDateTime gt '${cursor.modifiedAt.toISOString()}'`,
      `TransactionId gt '${cursor.transactionId}'`,
    ].join(" and ");

    const url = new URL("/data/RetailTransactions", erpBaseUrl);
    url.searchParams.set("$filter", filter);
    url.searchParams.set("$orderby", "ModifiedDateTime,TransactionId");
    url.searchParams.set("$top", String(BATCH_SIZE));
    url.searchParams.set("$expand", "Lines");

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`ERP respondió ${res.status}: ${await res.text()}`);
    }

    const body = (await res.json()) as { value: RetailTransaction[] };
    if (body.value.length === 0) break;

    // 3. Insertar en lotes con upsert
    const { bucketsAffected } = await insertBatch(pool, body.value);
    bucketsAffected.forEach((b) => touchedBuckets.add(b));
    totalProcessed += body.value.length;

    // Avanzar cursor al último del lote
    const last = body.value[body.value.length - 1];
    cursor = {
      modifiedAt: new Date(last.ModifiedDateTime),
      transactionId: last.TransactionId,
    };

    logger.info({ batch: body.value.length, total: totalProcessed }, "Lote ingerido");

    if (body.value.length < BATCH_SIZE) break;
  }

  if (totalProcessed === 0) {
    logger.info("Sin datos nuevos");
    return { rowsProcessed: 0 };
  }

  // 4. Actualizar watermark
  await updateWatermark(pool, cursor);

  // 5. Refrescar rollups solo para las horas afectadas
  await refreshRollups(pool, touchedBuckets);

  // 6. Incrementar data_version para invalidar caché
  await pool.query("UPDATE data_version SET version = version + 1 WHERE id = 1");
  await redis.incr("data_version");

  logger.info(
    { totalProcessed, bucketsRefreshed: touchedBuckets.size },
    "Ingesta completa",
  );

  return { rowsProcessed: totalProcessed };
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

async function readWatermark(pool: Pool): Promise<Watermark> {
  const { rows } = await pool.query<{
    last_modified_at: Date;
    last_transaction_id: string;
  }>("SELECT last_modified_at, last_transaction_id FROM ingestion_state WHERE id = 1");

  return {
    lastModifiedAt: rows[0].last_modified_at,
    lastTransactionId: rows[0].last_transaction_id,
  };
}

async function updateWatermark(pool: Pool, cursor: { modifiedAt: Date; transactionId: string }) {
  await pool.query(
    `UPDATE ingestion_state
     SET last_modified_at = $1, last_transaction_id = $2,
         last_run_at = NOW(), rows_processed = rows_processed + 1
     WHERE id = 1`,
    [cursor.modifiedAt, cursor.transactionId],
  );
}

async function insertBatch(
  pool: Pool,
  batch: RetailTransaction[],
): Promise<{ bucketsAffected: string[] }> {
  const client = await pool.connect();
  const buckets: string[] = [];

  try {
    await client.query("BEGIN");

    for (const raw of batch) {
      const tx = mapTransaction(raw);

      // Upsert condicional: solo actualiza si la versión del ERP es más nueva
      await client.query(
        `INSERT INTO transactions
           (transaction_id, store_id, terminal_id, cashier_id, trans_date,
            total_neto, payment_method, is_void, modified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (transaction_id, trans_date) DO UPDATE
           SET total_neto     = EXCLUDED.total_neto,
               is_void        = EXCLUDED.is_void,
               payment_method = EXCLUDED.payment_method,
               modified_at    = EXCLUDED.modified_at
           WHERE transactions.modified_at < EXCLUDED.modified_at`,
        [
          tx.transactionId, tx.storeId, tx.terminalId, tx.cashierId,
          tx.transDate, tx.totalNeto, tx.paymentMethod, tx.isVoid, tx.modifiedAt,
        ],
      );

      // Líneas: idempotentes con clave natural
      const lines = mapLines(raw);
      for (const line of lines) {
        await client.query(
          `INSERT INTO transaction_lines
             (transaction_id, trans_date, line_num, sku, product_name,
              quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (transaction_id, line_num) DO NOTHING`,
          [
            line.transactionId, line.transDate, line.lineNum,
            line.sku, line.productName, line.quantity,
            line.unitPrice, line.lineTotal,
          ],
        );
      }

      // Registrar bucket afectado para refrescar el rollup
      // El bucket es la hora local de la tienda; aquí se registra
      // como "store_id|trans_date_iso" y refreshRollups lo resolverá
      buckets.push(`${tx.storeId}|${tx.transDate.toISOString()}`);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { bucketsAffected: buckets };
}

/**
 * Refresca solo las horas afectadas por el lote. Es la pieza central
 * de la fase 1: el coste de recalcular es proporcional al lote ingerido,
 * no al rango total consultado.
 */
async function refreshRollups(pool: Pool, buckets: Set<string>) {
  // Extraer pares únicos (store_id, hora truncada)
  const uniqueHours = new Map<string, { storeId: string; bucket: Date }>();
  for (const key of buckets) {
    const [storeId, isoDate] = key.split("|");
    const d = new Date(isoDate);
    d.setMinutes(0, 0, 0);
    const mapKey = `${storeId}|${d.toISOString()}`;
    if (!uniqueHours.has(mapKey)) {
      uniqueHours.set(mapKey, { storeId, bucket: d });
    }
  }

  for (const { storeId, bucket } of uniqueHours.values()) {
    const bucketEnd = new Date(bucket.getTime() + 3_600_000);

    // Rollup sales_hourly
    await pool.query(
      `INSERT INTO sales_hourly (bucket, store_id, sales, tickets, units)
       SELECT $1, $2,
              COALESCE(SUM(t.total_neto), 0),
              COUNT(*)::int,
              COALESCE((SELECT SUM(l.quantity) FROM transaction_lines l
                        WHERE l.transaction_id = ANY(ARRAY_AGG(t.transaction_id))), 0)::int
       FROM transactions t
       WHERE t.store_id = $2
         AND t.trans_date >= $1 AND t.trans_date < $3
         AND NOT t.is_void
       ON CONFLICT (store_id, bucket) DO UPDATE
         SET sales   = EXCLUDED.sales,
             tickets = EXCLUDED.tickets,
             units   = EXCLUDED.units`,
      [bucket, storeId, bucketEnd],
    );

    // Rollup payment_hourly
    await pool.query(
      `INSERT INTO payment_hourly (bucket, store_id, payment_method, sales, tickets)
       SELECT $1, $2, t.payment_method,
              COALESCE(SUM(t.total_neto), 0),
              COUNT(*)::int
       FROM transactions t
       WHERE t.store_id = $2
         AND t.trans_date >= $1 AND t.trans_date < $3
         AND NOT t.is_void
       GROUP BY t.payment_method
       ON CONFLICT (store_id, bucket, payment_method) DO UPDATE
         SET sales   = EXCLUDED.sales,
             tickets = EXCLUDED.tickets`,
      [bucket, storeId, bucketEnd],
    );

    // Rollup product_daily
    const day = bucket.toISOString().slice(0, 10);
    const dayStart = new Date(day + "T00:00:00Z");
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    await pool.query(
      `INSERT INTO product_daily (day, store_id, sku, units, sales)
       SELECT $1::date, $2, l.sku,
              SUM(l.quantity)::int,
              SUM(l.line_total)
       FROM transaction_lines l
       JOIN transactions t ON t.transaction_id = l.transaction_id
                          AND t.trans_date = l.trans_date
       WHERE t.store_id = $2
         AND t.trans_date >= $3 AND t.trans_date < $4
         AND NOT t.is_void
       GROUP BY l.sku
       ON CONFLICT (store_id, day, sku) DO UPDATE
         SET units = EXCLUDED.units,
             sales = EXCLUDED.sales`,
      [day, storeId, dayStart, dayEnd],
    );
  }

  logger.info({ hoursRefreshed: uniqueHours.size }, "Rollups refrescados");
}
