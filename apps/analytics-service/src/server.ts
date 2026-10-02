import express from "express";
import pg from "pg";
import Redis from "ioredis";
import pino from "pino";
import { dashboardFiltersSchema } from "@retail/shared";
import { queryDashboardSummary } from "./queries/dashboard.js";
import { exportCsv } from "./queries/export-csv.js";
import { createSWRCache } from "./cache/swr.js";
import type { DashboardSummary } from "@retail/shared";

const logger = pino({ transport: { target: "pino-pretty" } });
const app = express();
const PORT = Number(process.env.ANALYTICS_PORT ?? 4020);

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://dashboard:dashboard@localhost:5432/retail_dashboard",
  max: 10,
  statement_timeout: Number(process.env.STATEMENT_TIMEOUT_MS ?? 10_000),
});

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const cache = createSWRCache(redis);

// ── Middleware de logging con duración y requestId ──────────────────────

let reqCounter = 0;
app.use((req, res, next) => {
  const requestId = `R-${++reqCounter}`;
  const start = Date.now();
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = durationMs > 500 ? "warn" : "info";
    logger[level](
      { requestId, method: req.method, url: req.originalUrl, durationMs, status: res.statusCode },
      "request",
    );
  });

  (req as Record<string, unknown>).requestId = requestId;
  next();
});

// ── Endpoint principal: /dashboard/summary ─────────────────────────────

app.get("/dashboard/summary", async (req, res) => {
  // Validar filtros con el esquema Zod compartido
  const parsed = dashboardFiltersSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    });
    return;
  }

  const filters = parsed.data;
  const storeIds = filters.store === "all" ? [] : [filters.store];
  const timezone = "America/Lima"; // por ahora fijo; se podría derivar de la tienda

  const cacheKey = cache.dashboardKey(
    "summary",
    filters.from,
    filters.to,
    filters.granularity,
    storeIds,
  );

  try {
    const { value, cached: wasCached } = await cache.cached(cacheKey, () =>
      queryDashboardSummary(
        pool,
        {
          from: filters.from,
          to: filters.to,
          storeIds,
          granularity: filters.granularity,
        },
        timezone,
      ),
    );

    const dataVersion = await cache.getDataVersion();

    const summary: DashboardSummary = {
      ...value,
      meta: {
        granularity: filters.granularity,
        timezone,
        generatedAt: new Date().toISOString(),
        cached: wasCached,
        dataVersion,
      },
    };

    res.json({ success: true, data: summary, error: null });
  } catch (err) {
    logger.error(err, "Error en /dashboard/summary");
    res.status(500).json({
      success: false,
      data: null,
      error: "Error al calcular el dashboard",
      requestId: (req as Record<string, unknown>).requestId,
    });
  }
});

// ── Export CSV ──────────────────────────────────────────────────────────

app.get("/export.csv", async (req, res) => {
  try {
    await exportCsv(pool, req, res);
  } catch (err) {
    logger.error(err, "Error en export CSV");
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Error al exportar" });
    }
  }
});

// ── Health + readiness ─────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    await redis.ping();
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "unhealthy", error: String(err) });
  }
});

// ── Catálogos (para los filtros del front) ─────────────────────────────

app.get("/stores", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT store_id, name, city, timezone FROM stores ORDER BY name",
  );
  res.json({ success: true, data: rows, error: null });
});

app.listen(PORT, () => {
  logger.info(`Analytics service en http://localhost:${PORT}`);
});
