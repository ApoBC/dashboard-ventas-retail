import type { Pool } from "pg";
import type { Request, Response } from "express";
import Cursor from "pg-cursor";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });

/**
 * Export CSV en streaming con cursor de servidor.
 *
 * Corrección del hallazgo 9: construir el CSV entero en memoria es un
 * out-of-memory esperando el día que alguien exporte el trimestre.
 *
 * - Cursor de servidor: lee 500 filas a la vez.
 * - Tope duro de filas (MAX_EXPORT_ROWS).
 * - BOM UTF-8 al inicio para que Excel abra bien los acentos.
 * - Contrapresión: respeta res.write() === false antes de seguir.
 */

const MAX_EXPORT_ROWS = Number(process.env.MAX_EXPORT_ROWS ?? 100_000);

export async function exportCsv(
  pool: Pool,
  req: Request,
  res: Response,
): Promise<void> {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const storeId = req.query.store as string | undefined;

  const where = ["t.trans_date >= $1::timestamptz", "t.trans_date < $2::timestamptz", "NOT t.is_void"];
  const params: unknown[] = [from, to];

  if (storeId && storeId !== "all") {
    params.push(storeId);
    where.push(`t.store_id = $${params.length}::text`);
  }

  const sql = `
    SELECT t.trans_date, t.store_id, t.terminal_id, t.cashier_id,
           t.transaction_id, t.total_neto, t.payment_method
    FROM transactions t
    WHERE ${where.join(" AND ")}
    ORDER BY t.trans_date
  `;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="ventas.csv"');

  // BOM para Excel
  res.write("﻿");
  res.write("fecha,tienda,terminal,cajero,ticket,total,medio_pago\n");

  const client = await pool.connect();
  try {
    const cursor = client.query(new Cursor(sql, params));
    let sent = 0;

    const readBatch = (): Promise<Record<string, unknown>[]> =>
      new Promise((resolve, reject) => {
        cursor.read(500, (err: Error | null, rows: Record<string, unknown>[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

    while (true) {
      const rows = await readBatch();
      if (rows.length === 0) break;

      for (const row of rows) {
        const line = [
          row.trans_date,
          row.store_id,
          row.terminal_id,
          row.cashier_id,
          row.transaction_id,
          row.total_neto,
          row.payment_method,
        ].join(",");

        const canContinue = res.write(line + "\n");

        if (++sent >= MAX_EXPORT_ROWS) {
          res.write(`# truncado en ${MAX_EXPORT_ROWS} filas\n`);
          cursor.close(() => {});
          return res.end();
        }

        // Contrapresión: esperar drain si el buffer está lleno
        if (!canContinue) {
          await new Promise<void>((resolve) => res.once("drain", resolve));
        }
      }
    }

    cursor.close(() => {});
    res.end();

    logger.info({ rows: sent, from, to }, "CSV exportado");
  } finally {
    client.release();
  }
}
