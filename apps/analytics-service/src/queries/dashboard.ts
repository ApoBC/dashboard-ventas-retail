import type { Pool } from "pg";
import type {
  Kpis,
  SalesByBucket,
  SalesByStore,
  TopProduct,
  PaymentMix,
  DashboardSummary,
} from "@retail/shared";

/**
 * Consultas del dashboard sobre las tablas de rollup (fase 1).
 *
 * Ninguna consulta toca la tabla cruda `transactions` directamente.
 * Todo sale de sales_hourly, payment_hourly y product_daily, que la
 * ingesta mantiene incrementalmente.
 *
 * Corrección del hallazgo 6: el predicado de tienda usa = ANY($N::text[])
 * en lugar de ($N IS NULL OR store_id = $N), que inhibe el índice.
 */

type QueryParams = {
  from: string;
  to: string;
  storeIds: string[];
  granularity: "hour" | "day";
};

function storeFilter(
  storeIds: string[],
  paramIndex: number,
): { clause: string; param: string[] | null } {
  if (storeIds.length === 0 || (storeIds.length === 1 && storeIds[0] === "all")) {
    return { clause: "", param: null };
  }
  return {
    clause: `AND store_id = ANY($${paramIndex}::text[])`,
    param: storeIds,
  };
}

export async function queryKpis(pool: Pool, p: QueryParams): Promise<Kpis> {
  const store = storeFilter(p.storeIds, 3);
  const params: unknown[] = [p.from, p.to];
  if (store.param) params.push(store.param);

  const sql = `
    SELECT
      COALESCE(SUM(sales), 0)::float    AS sales,
      COALESCE(SUM(tickets), 0)::int    AS tickets,
      COALESCE(SUM(units), 0)::int      AS units
    FROM sales_hourly
    WHERE bucket >= $1::timestamptz
      AND bucket < $2::timestamptz
      ${store.clause}
  `;
  const { rows } = await pool.query(sql, params);
  const current = rows[0];
  const avgTicket = current.tickets > 0 ? current.sales / current.tickets : 0;

  // Periodo anterior: mismo largo, justo antes del inicio
  const fromDate = new Date(p.from);
  const toDate = new Date(p.to);
  const rangeMs = toDate.getTime() - fromDate.getTime();
  const prevFrom = new Date(fromDate.getTime() - rangeMs).toISOString().slice(0, 10);
  const prevTo = p.from;

  const prevParams: unknown[] = [prevFrom, prevTo];
  if (store.param) prevParams.push(store.param);

  const { rows: prevRows } = await pool.query(
    sql.replace("$1", "$1").replace("$2", "$2"),
    prevParams,
  );
  const prev = prevRows[0];
  const prevAvg = prev.tickets > 0 ? prev.sales / prev.tickets : 0;

  return {
    sales: current.sales,
    tickets: current.tickets,
    avgTicket: Math.round(avgTicket * 100) / 100,
    units: current.units,
    previous: {
      sales: prev.sales,
      tickets: prev.tickets,
      avgTicket: Math.round(prevAvg * 100) / 100,
      units: prev.units,
    },
  };
}

export async function querySalesByBucket(
  pool: Pool,
  p: QueryParams,
): Promise<SalesByBucket> {
  const store = storeFilter(p.storeIds, 3);
  const params: unknown[] = [p.from, p.to];
  if (store.param) params.push(store.param);

  const truncExpr =
    p.granularity === "hour" ? "bucket" : "date_trunc('day', bucket)";

  const sql = `
    SELECT ${truncExpr}::text AS bucket,
           SUM(sales)::float  AS sales,
           SUM(tickets)::int  AS tickets
    FROM sales_hourly
    WHERE bucket >= $1::timestamptz
      AND bucket < $2::timestamptz
      ${store.clause}
    GROUP BY 1
    ORDER BY 1
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function querySalesByStore(
  pool: Pool,
  p: QueryParams,
): Promise<SalesByStore[]> {
  const sql = `
    SELECT sh.store_id   AS "storeId",
           s.name        AS "storeName",
           SUM(sh.sales)::float AS sales
    FROM sales_hourly sh
    JOIN stores s ON s.store_id = sh.store_id
    WHERE sh.bucket >= $1::timestamptz
      AND sh.bucket < $2::timestamptz
    GROUP BY sh.store_id, s.name
    ORDER BY sales DESC
  `;

  const { rows } = await pool.query(sql, [p.from, p.to]);
  return rows;
}

export async function queryTopProducts(
  pool: Pool,
  p: QueryParams,
  limit = 10,
): Promise<TopProduct[]> {
  const store = storeFilter(p.storeIds, 3);
  const params: unknown[] = [p.from, p.to];
  if (store.param) params.push(store.param);

  const limitParam = params.length + 1;
  params.push(limit);

  const sql = `
    SELECT pd.sku,
           MAX(pr.name)          AS name,
           SUM(pd.units)::int    AS units,
           SUM(pd.sales)::float  AS sales
    FROM product_daily pd
    LEFT JOIN products pr ON pr.sku = pd.sku
    WHERE pd.day >= $1::date
      AND pd.day < $2::date
      ${store.clause}
    GROUP BY pd.sku
    ORDER BY units DESC
    LIMIT $${limitParam}
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function queryPaymentMix(
  pool: Pool,
  p: QueryParams,
): Promise<PaymentMix> {
  const store = storeFilter(p.storeIds, 3);
  const params: unknown[] = [p.from, p.to];
  if (store.param) params.push(store.param);

  const sql = `
    SELECT payment_method AS method,
           SUM(sales)::float AS sales
    FROM payment_hourly
    WHERE bucket >= $1::timestamptz
      AND bucket < $2::timestamptz
      ${store.clause}
    GROUP BY payment_method
    ORDER BY sales DESC
  `;

  const { rows } = await pool.query(sql, params);
  const total = rows.reduce((s: number, r: { sales: number }) => s + r.sales, 0);

  return rows.map((r: { method: string; sales: number }) => ({
    method: r.method,
    sales: r.sales,
    share: total > 0 ? Math.round((r.sales / total) * 1000) / 10 : 0,
  }));
}

export async function queryDashboardSummary(
  pool: Pool,
  p: QueryParams,
  timezone: string,
): Promise<Omit<DashboardSummary, "meta">> {
  const [kpis, byBucket, byStore, topProducts, paymentMix] = await Promise.all([
    queryKpis(pool, p),
    querySalesByBucket(pool, p),
    querySalesByStore(pool, p),
    queryTopProducts(pool, p),
    queryPaymentMix(pool, p),
  ]);

  return { kpis, byBucket, byStore, topProducts, paymentMix };
}
