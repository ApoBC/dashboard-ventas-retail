# Dashboard de ventas retail

Dashboard de analítica para gerentes de tienda. Muestra ventas por tienda, hora, producto y medio de pago a partir de transacciones de punto de venta, con ingesta incremental desde un ERP simulado.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript, Recharts, TanStack Query, Tailwind CSS |
| Backend | Node.js 22 + Express, TypeScript |
| Base de datos | PostgreSQL 16 (particionada por mes) |
| Caché | Redis 7 (stale-while-revalidate) |
| Datos falsos | `@faker-js/faker` con curva de hora punta |
| Monorepo | pnpm workspaces |
| Infra | Docker Compose |

## Arquitectura

```
pos-simulator ──► erp-mock (OData)
                      │
            ingestion-service (cron, watermark compuesto)
                      │
                PostgreSQL ◄── rollups incrementales
                      │
            analytics-service (consultas sobre rollups + caché SWR)
                      │
                api-gateway (rate limit, compresión, proxy)
                      │
                React dashboard
```

**Principios aplicados:**

- **Separación lectura/escritura (CQRS simple):** la ingesta escribe en `transactions`, recalcula rollups; la analítica lee solo de rollups. El dashboard nunca consulta la tabla cruda.
- **Adaptador ERP intercambiable:** variable `ERP_PROVIDER=mock|erpnext|d365`.
- **Idempotencia:** cursor compuesto `(modified_at, transaction_id)` + ventana de solapamiento + upsert condicional. La ingesta puede releer sin crear duplicados ni inflar métricas.

## Levantar el proyecto

```bash
# 1. Clonar y entrar
git clone <repo> && cd retail-dashboard

# 2. Instalar dependencias
pnpm install

# 3. Levantar Postgres y Redis
docker compose -f infra/docker-compose.yml up -d

# 4. Arrancar los servicios (en terminales separadas o con tmux)
pnpm --filter erp-mock dev          # puerto 4010
pnpm --filter pos-simulator seed    # genera 30 días de historia
pnpm --filter ingestion-service dev # puerto interno, cron cada 10 min
pnpm --filter analytics-service dev # puerto 4020
pnpm --filter api-gateway dev       # puerto 3000
pnpm --filter web dev               # puerto 5173
```

Abrir `http://localhost:5173`.

## Estructura del monorepo

```
apps/
  web/                  React dashboard
  api-gateway/          Entrada única, rate limiting, proxy
  analytics-service/    Consultas sobre rollups, caché SWR, export CSV
  ingestion-service/    Ingesta incremental con watermark compuesto
  erp-mock/             Mock OData v4 (simula D365 F&O)
  pos-simulator/        Generador de transacciones POS realistas
packages/
  shared/               Tipos TS, esquema Zod de filtros, utilidades de formato
infra/
  docker-compose.yml    Postgres 16 + Redis 7
  init-db.sql           Esquema con particiones, rollups e índices
docs/
  03-dashboard-diseno.md        Decisiones de diseño del dashboard
  03-dashboard-rendimiento.md   Correcciones y optimización bajo carga
  03-dashboard-conexiones.md    Conexiones y monitoreo
```

## Documentación

- [Diseño del dashboard](docs/03-dashboard-diseno.md) — base de UI elegida, layout, KPIs, estados de interfaz
- [Correcciones y rendimiento](docs/03-dashboard-rendimiento.md) — 13 hallazgos con corrección y código
- [Conexiones y monitoreo](docs/03-dashboard-conexiones.md) — flujo de datos, health checks, preparación para Prometheus/Grafana/Sentry

## Línea para el CV

> Dashboard de analítica de ventas retail (React, Node.js, PostgreSQL, Redis). Ingesta incremental de transacciones POS desde ERP vía OData con cursor compuesto, ventana de solapamiento e idempotencia, separación de escritura y lectura (CQRS), rollups incrementales, caché stale-while-revalidate, y KPIs con visualizaciones por tienda, hora y producto.
