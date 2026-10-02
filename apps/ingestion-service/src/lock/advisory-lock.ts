import type { Pool } from "pg";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });

/**
 * Advisory lock de PostgreSQL para evitar que dos corridas del cron
 * se solapen. Hallazgo 3: sin esto, dos ejecuciones leen el mismo
 * watermark y duplican trabajo (o peor, compiten por los bloqueos).
 *
 * pg_try_advisory_lock es no bloqueante: si otro proceso ya tiene
 * el lock, retorna false y esta corrida se omite limpiamente.
 */
const INGEST_LOCK_KEY = 4711;

export async function withIngestLock<T>(
  pool: Pool,
  run: () => Promise<T>,
): Promise<T | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [INGEST_LOCK_KEY],
    );

    if (!rows[0].acquired) {
      logger.info("Ingesta ya en curso, se omite esta corrida");
      return null;
    }

    try {
      return await run();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
