-- ==========================================================================
-- Esquema inicial del dashboard de ventas retail
-- Incluye las correcciones de fase 0 y fase 1 desde el inicio:
--   - Particionado por mes en transactions
--   - Clave natural en transaction_lines (idempotencia real)
--   - Tabla de rollup sales_hourly (CQRS: lectura separada de escritura)
--   - Rollup product_daily para top de productos
--   - Índices compuestos y parciales
--   - pg_stat_statements para observabilidad
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- === Catálogos ===

CREATE TABLE stores (
  store_id   TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL,
  timezone   TEXT NOT NULL DEFAULT 'America/Lima'  -- IANA; todas las agregaciones por hora usan esto
);

INSERT INTO stores (store_id, name, city, timezone) VALUES
  ('LIM-01', 'Lima Centro', 'Lima', 'America/Lima'),
  ('LIM-02', 'Lima Sur', 'Lima', 'America/Lima'),
  ('AQP-01', 'Arequipa', 'Arequipa', 'America/Lima'),
  ('TRU-01', 'Trujillo', 'Trujillo', 'America/Lima'),
  ('CUZ-01', 'Cusco', 'Cusco', 'America/Lima');

CREATE TABLE cashiers (
  cashier_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  store_id   TEXT NOT NULL REFERENCES stores(store_id)
);

CREATE TABLE products (
  sku        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  uom        TEXT NOT NULL DEFAULT 'UN'
);

-- === Transacciones: tabla particionada por mes ===

CREATE TABLE transactions (
  transaction_id TEXT         NOT NULL,
  store_id       TEXT         NOT NULL REFERENCES stores(store_id),
  terminal_id    TEXT         NOT NULL,
  cashier_id     TEXT         NOT NULL,
  trans_date     TIMESTAMPTZ  NOT NULL,
  total_neto     NUMERIC(12,2) NOT NULL,
  payment_method TEXT         NOT NULL,
  is_void        BOOLEAN      NOT NULL DEFAULT FALSE,
  modified_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, trans_date)
) PARTITION BY RANGE (trans_date);

-- Particiones mensuales (el seed genera 30 días hacia atrás)
CREATE TABLE transactions_2026_08 PARTITION OF transactions
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE transactions_2026_09 PARTITION OF transactions
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE transactions_2026_10 PARTITION OF transactions
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE transactions_2026_11 PARTITION OF transactions
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

-- Índice compuesto para consultas por tienda + rango, parcial para excluir anulados
CREATE INDEX transactions_store_date_idx
  ON transactions (store_id, trans_date) WHERE NOT is_void;

-- Índice para el cursor compuesto del watermark (fase 0, hallazgo 1)
CREATE INDEX transactions_modified_cursor_idx
  ON transactions (modified_at, transaction_id);

-- === Líneas de transacción ===

CREATE TABLE transaction_lines (
  transaction_id TEXT         NOT NULL,
  trans_date     TIMESTAMPTZ  NOT NULL,  -- para el particionado FK
  line_num       INTEGER      NOT NULL,
  sku            TEXT         NOT NULL,
  product_name   TEXT         NOT NULL,
  quantity       INTEGER      NOT NULL,  -- negativo = devolución
  unit_price     NUMERIC(10,2) NOT NULL,
  line_total     NUMERIC(12,2) NOT NULL,
  -- Clave natural única: idempotencia real (fase 0, hallazgo 4)
  CONSTRAINT transaction_lines_natural_key UNIQUE (transaction_id, line_num),
  FOREIGN KEY (transaction_id, trans_date) REFERENCES transactions(transaction_id, trans_date)
);

CREATE INDEX transaction_lines_tx_idx  ON transaction_lines (transaction_id);
CREATE INDEX transaction_lines_sku_idx ON transaction_lines (sku);

-- === Estado de la ingesta ===

CREATE TABLE ingestion_state (
  id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  last_modified_at   TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01',
  last_transaction_id TEXT NOT NULL DEFAULT '',
  last_run_at        TIMESTAMPTZ,
  rows_processed     BIGINT NOT NULL DEFAULT 0
);

INSERT INTO ingestion_state DEFAULT VALUES;

-- === Rollups (fase 1, hallazgo 5) ===

-- Rollup por hora: la analítica consulta aquí, nunca la tabla cruda
CREATE TABLE sales_hourly (
  bucket     TIMESTAMPTZ NOT NULL,   -- inicio de hora en hora LOCAL de la tienda
  store_id   TEXT        NOT NULL REFERENCES stores(store_id),
  sales      NUMERIC(14,2) NOT NULL DEFAULT 0,
  tickets    INTEGER       NOT NULL DEFAULT 0,
  units      INTEGER       NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, bucket)
);

CREATE INDEX sales_hourly_bucket_idx ON sales_hourly (bucket);

-- Rollup de producto por día: para top de productos
CREATE TABLE product_daily (
  day        DATE   NOT NULL,
  store_id   TEXT   NOT NULL REFERENCES stores(store_id),
  sku        TEXT   NOT NULL,
  units      INTEGER       NOT NULL DEFAULT 0,
  sales      NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, day, sku)
);

-- === Medios de pago por hora (para el donut) ===

CREATE TABLE payment_hourly (
  bucket         TIMESTAMPTZ NOT NULL,
  store_id       TEXT        NOT NULL REFERENCES stores(store_id),
  payment_method TEXT        NOT NULL,
  sales          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tickets        INTEGER       NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, bucket, payment_method)
);

-- === Versión de datos: la ingesta incrementa, la caché invalida ===

CREATE TABLE data_version (
  id      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version BIGINT NOT NULL DEFAULT 0
);

INSERT INTO data_version DEFAULT VALUES;
