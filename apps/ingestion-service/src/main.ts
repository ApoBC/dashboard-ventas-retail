import pg from "pg";
import Redis from "ioredis";
import pino from "pino";
import { withIngestLock } from "./lock/advisory-lock.js";
import { runIngestJob } from "./ingest-job.js";

const logger = pino({ transport: { target: "pino-pretty" } });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://dashboard:dashboard@localhost:5432/retail_dashboard",
  max: 5,
  statement_timeout: 30_000,
});

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const ERP_URL = process.env.ERP_MOCK_URL ?? "http://localhost:4010";
const INTERVAL_MS = Number(process.env.INGESTION_INTERVAL_MS ?? 600_000); // 10 min

async function tick() {
  const result = await withIngestLock(pool, () =>
    runIngestJob(pool, redis, ERP_URL),
  );

  if (result === null) {
    logger.info("Lock no adquirido, se omite esta corrida");
  }
}

logger.info({ intervalMs: INTERVAL_MS, erpUrl: ERP_URL }, "Ingestion service iniciado");

// Primera corrida inmediata
tick().catch((err) => logger.error(err, "Error en la primera corrida"));

// Repetir cada INTERVAL_MS
setInterval(() => {
  tick().catch((err) => logger.error(err, "Error en corrida periódica"));
}, INTERVAL_MS);
