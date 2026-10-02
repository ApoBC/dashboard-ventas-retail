import express from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });
const app = express();
const PORT = Number(process.env.API_PORT ?? 3000);

const ANALYTICS_URL = process.env.ANALYTICS_URL ?? "http://localhost:4020";
const ERP_MOCK_URL = process.env.ERP_MOCK_URL ?? "http://localhost:4010";

// ── Middleware global ──────────────────────────────────────────────────

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(compression());

// Rate limiting: 60 req/min por IP (hallazgo 12)
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Demasiadas peticiones, intenta en un minuto" },
  }),
);

// ── Proxy a analytics-service ──────────────────────────────────────────
// http-proxy-middleware v3: use pathFilter at middleware level, pathRewrite
// removes the /api prefix so analytics-service receives /dashboard/*, /stores, etc.

app.use(
  createProxyMiddleware({
    target: ANALYTICS_URL,
    changeOrigin: true,
    pathFilter: ["/api/dashboard", "/api/export.csv", "/api/stores"],
    pathRewrite: (path) => path.replace(/^\/api/, ""),
  }),
);

// ── Proxy al ERP mock (para depuración) ────────────────────────────────

app.use(
  createProxyMiddleware({
    target: ERP_MOCK_URL,
    changeOrigin: true,
    pathFilter: "/api/erp",
    pathRewrite: (path) => path.replace(/^\/api\/erp/, ""),
  }),
);

// ── Health del gateway ─────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.listen(PORT, () => {
  logger.info(`API Gateway en http://localhost:${PORT}`);
});
