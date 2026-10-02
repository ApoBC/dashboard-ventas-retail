# Proyecto 03 — Conexiones a sistemas de monitoreo y dashboard

> Cómo se conecta cada pieza del sistema: flujo de datos, puntos de
> observabilidad, y preparación para integrar monitoreo externo.

---

## 1. Flujo de datos completo

```
pos-simulator                erp-mock                    ingestion-service
  │                            │                              │
  │ POST /data/Retail          │                              │
  │ Transactions/batch ──────► │ (almacén en memoria)         │
  │                            │                              │
  │                            │ ◄── GET /data/Retail         │
  │                            │     Transactions             │
  │                            │     ?$filter=...             │
  │                            │     &$orderby=Modified       │
  │                            │     DateTime,TransactionId   │
  │                            │     &$top=500                │
  │                            │     &$expand=Lines           │
  │                            │                              │
  │                            │ ─── JSON (OData-like) ────►  │
  │                            │                              │
  │                            │                    ┌─────────┴──────────┐
  │                            │                    │ PostgreSQL         │
  │                            │                    │  transactions      │
  │                            │                    │  transaction_lines │
  │                            │                    │  sales_hourly      │ ◄── rollup
  │                            │                    │  product_daily     │ ◄── rollup
  │                            │                    │  payment_hourly    │ ◄── rollup
  │                            │                    │  data_version      │
  │                            │                    └──────┬─────────────┘
  │                            │                           │
  │                            │                    ┌──────┴─────────────┐
  │                            │                    │ Redis              │
  │                            │                    │  data_version      │
  │                            │                    │  dash:v1:*         │ ◄── caché SWR
  │                            │                    │  dash:v1:*:lock    │
  │                            │                    └──────┬─────────────┘
  │                            │                           │
  │                            │                analytics-service
  │                            │                    │
  │                            │         GET /dashboard/summary
  │                            │         GET /export.csv
  │                            │         GET /stores
  │                            │         GET /health
  │                            │                    │
  │                            │              api-gateway (puerto 3000)
  │                            │                    │
  │                            │         /api/dashboard/* ──► analytics (4020)
  │                            │         /api/export.csv ──► analytics (4020)
  │                            │         /api/stores     ──► analytics (4020)
  │                            │         /api/erp/*      ──► erp-mock  (4010)
  │                            │                    │
  │                            │                React (Vite, puerto 5173)
  │                            │                    │
  │                            │         proxy /api → localhost:3000
```

---

## 2. Endpoints de salud (health checks)

Cada servicio expone `/health`. Docker Compose y cualquier orquestador
pueden usarlos directamente.

| Servicio | URL | Qué verifica |
|---|---|---|
| erp-mock | `GET :4010/health` | Servidor levantado |
| analytics-service | `GET :4020/health` | Conexión a Postgres + ping a Redis |
| api-gateway | `GET :3000/health` | Servidor levantado |
| Postgres | `pg_isready` en el healthcheck de Docker | Acepta conexiones |
| Redis | `redis-cli ping` en el healthcheck de Docker | Responde PONG |

El endpoint de analytics devuelve `503` si Postgres o Redis no están
disponibles, lo que permite que un load balancer retire la instancia.

---

## 3. Observabilidad incorporada

### 3.1 Logs estructurados (Pino)

Todos los servicios usan Pino con formato JSON. Cada entrada incluye:

```json
{
  "level": 30,
  "time": 1727560800000,
  "requestId": "R-42",
  "method": "GET",
  "url": "/dashboard/summary?from=2026-09-01&to=2026-09-28",
  "durationMs": 84,
  "status": 200,
  "cached": true
}
```

- `requestId` es el mismo que llega al front en el header `x-request-id`
  y que el ErrorBoundary muestra al usuario. Un gerente reporta "me sale
  error R-42" y se busca en los logs con `grep R-42`.
- Peticiones por encima de 500 ms se loguean como `warn`.
- La ingesta loguea filas procesadas, buckets refrescados y versión de
  datos incrementada.

### 3.2 Métricas en Postgres

```sql
-- Activar (ya lo hace init-db.sql)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Las 10 consultas que más tiempo total consumen
SELECT calls,
       round(mean_exec_time::numeric, 1) AS media_ms,
       round(total_exec_time::numeric)   AS total_ms,
       query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### 3.3 Métricas en Redis

```bash
# Verificar el tamaño del caché
redis-cli INFO keyspace

# Ver las claves activas del dashboard
redis-cli KEYS 'dash:v1:*'

# Ver la versión de datos actual
redis-cli GET data_version
```

---

## 4. Preparación para monitoreo externo

El sistema está diseñado para conectarse a herramientas de monitoreo sin
cambiar la arquitectura. Cada integración es un middleware o un
transporte de logs adicional, no una reescritura.

### 4.1 Prometheus + Grafana

Para métricas en tiempo real, agregar `prom-client`:

```ts
// analytics-service/src/metrics.ts
import { collectDefaultMetrics, Registry, Histogram, Counter } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duración de las peticiones HTTP en ms',
  labelNames: ['method', 'route', 'status', 'cached'],
  buckets: [10, 50, 100, 300, 500, 1000, 3000],
  registers: [registry],
});

export const ingestBatchSize = new Counter({
  name: 'ingest_rows_total',
  help: 'Total de filas ingeridas',
  registers: [registry],
});
```

Endpoint: `GET /metrics` → `registry.metrics()`

Dashboards de Grafana sugeridos:
- **p50/p95/p99 de latencia por widget** (labels: route, cached)
- **Hit rate del caché** (peticiones cached=true / total)
- **Filas ingeridas por minuto** (contador ingest_rows_total)
- **Conexiones activas de Postgres** (pg_stat_activity)

### 4.2 Sentry (errores en producción)

```ts
// api-gateway/src/server.ts
import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
app.use(Sentry.Handlers.requestHandler());
// ... rutas ...
app.use(Sentry.Handlers.errorHandler());
```

En el front:

```ts
import * as Sentry from '@sentry/react';

Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
// Envolver App en Sentry.ErrorBoundary
```

### 4.3 Uptime monitoring

Los endpoints `/health` están listos para cualquier servicio de uptime
(UptimeRobot, Better Stack, Checkly). La configuración es:

| Check | URL | Intervalo | Condición de éxito |
|---|---|---|---|
| API Gateway | `http://host:3000/health` | 1 min | JSON `.status === "ok"` |
| Analytics | `http://host:4020/health` | 1 min | JSON `.status === "ok"`, HTTP 200 |
| Postgres | pg_isready | 30 s | exit code 0 |
| Redis | redis-cli ping | 30 s | respuesta PONG |

### 4.4 Alertas que valen la pena

| Alerta | Condición | Gravedad |
|---|---|---|
| Health check falla 3 veces seguidas | `/health` devuelve 503 o timeout | Crítica |
| p95 de `/dashboard/summary` > 2 s | Histogram bucket | Alta |
| Ingesta sin datos nuevos > 30 min | `last_run_at` en `ingestion_state` antiguo | Media |
| Cache hit rate < 50 % en 10 min | Contador prometheus | Media |
| Error rate > 5 % en 5 min | Peticiones 5xx / total | Alta |
| Pool de Postgres > 80 % ocupado | pg_stat_activity | Alta |

---

## 5. Puertos y servicios (resumen)

| Servicio | Puerto | Protocolo | Notas |
|---|---|---|---|
| React (Vite dev) | 5173 | HTTP | Proxy `/api` → gateway |
| API Gateway | 3000 | HTTP | Punto único de entrada |
| Analytics Service | 4020 | HTTP | Solo accesible vía gateway |
| ERP Mock | 4010 | HTTP | Solo accesible vía gateway |
| PostgreSQL | 5432 | TCP | Solo desde la red interna |
| Redis | 6379 | TCP | Solo desde la red interna |

En producción, solo el puerto 3000 (o su equivalente en el balanceador)
sería público. Los demás están en la red interna de Docker.

---

## 6. Variables de entorno por servicio

| Variable | Servicio | Ejemplo | Propósito |
|---|---|---|---|
| `DATABASE_URL` | ingestion, analytics | `postgresql://...` | Conexión a Postgres |
| `REDIS_URL` | ingestion, analytics | `redis://localhost:6379` | Conexión a Redis |
| `ERP_MOCK_URL` | ingestion, simulator | `http://localhost:4010` | URL del ERP mock |
| `INGESTION_INTERVAL_MS` | ingestion | `600000` | Cada cuánto corre la ingesta |
| `INGESTION_OVERLAP_MINUTES` | ingestion | `15` | Ventana de solapamiento |
| `CACHE_FRESH_MS` | analytics | `60000` | Tiempo de caché fresco |
| `CACHE_STALE_MS` | analytics | `600000` | Tiempo de caché caducado pero utilizable |
| `STATEMENT_TIMEOUT_MS` | analytics | `10000` | Timeout de consultas SQL |
| `MAX_EXPORT_ROWS` | analytics | `100000` | Tope de filas en export CSV |
| `API_PORT` | api-gateway | `3000` | Puerto del gateway |
| `RATE_LIMIT_MAX` | api-gateway | `60` | Peticiones por minuto por IP |
| `VITE_API_URL` | web | `/api` | Base de la API para el front |
| `SENTRY_DSN` | todos (opcional) | `https://...` | Error tracking |
