# Proyecto 03 — Correcciones y optimización para días de alta carga

> Revisión técnica del plan `03-dashboard-ventas-retail.md`. Cada punto indica el
> problema concreto del diseño original, por qué revienta en un día de mucho volumen
> (campaña, fin de mes, Black Friday) y la corrección aplicable.
>
> Severidad: **BLOQUEANTE** (produce datos incorrectos o caídas) · **ALTA** (degrada
> gravemente bajo carga) · **MEDIA** (mantenibilidad o coste).

---

## Resumen de hallazgos

| # | Hallazgo | Área | Severidad |
|---|---|---|---|
| 1 | Watermark con `gt` pierde registros | Ingesta | **BLOQUEANTE** |
| 2 | Agregaciones por hora en UTC, no en hora local de tienda | Analítica | **BLOQUEANTE** |
| 3 | Sin lock: dos corridas del cron se solapan | Ingesta | **ALTA** |
| 4 | `ON CONFLICT` solo definido para la cabecera, no para las líneas | Ingesta | **ALTA** |
| 5 | Consultas agregadas sobre la tabla cruda en cada request | Analítica | **ALTA** |
| 6 | Predicado `($3 IS NULL OR store_id = $3)` inhibe el índice | Analítica | **ALTA** |
| 7 | Caché con TTL fijo: estampida al expirar | Caché | **ALTA** |
| 8 | 5–6 peticiones por cada cambio de filtro | Frontend | **ALTA** |
| 9 | Export CSV cargado íntegro en memoria | Analítica | **ALTA** |
| 10 | Inserción fila a fila en la ingesta | Ingesta | MEDIA |
| 11 | Sin particionado ni política de retención | BD | MEDIA |
| 12 | Sin límite de rango ni rate limiting en el gateway | Gateway | MEDIA |
| 13 | Sin observabilidad de consultas lentas | Operación | MEDIA |

---

## 1. El watermark con `gt` pierde registros — BLOQUEANTE

El plan propone:

```
$filter=ModifiedDateTime gt {last_processed_at}&$orderby=ModifiedDateTime&$top=500
```

y luego "actualizar `last_processed_at` con la fecha más alta procesada".

Falla de tres formas, y las tres se agravan cuando hay volumen:

1. **Empates de timestamp.** En hora punta, decenas de transacciones comparten el mismo
   `ModifiedDateTime` con precisión de segundo. Si el lote de 500 corta justo en medio de
   un grupo de empatados, el resto de ese grupo queda por debajo del nuevo watermark y
   **nunca se lee**.
2. **Llegada tardía.** Una transacción con fecha 10:00 que se escribe en el ERP a las
   10:05, cuando el watermark ya avanzó a 10:03, se pierde.
3. **Desfase de reloj** entre el ERP y el servicio de ingesta.

### Corrección: cursor compuesto + ventana de solapamiento

El cursor deja de ser un instante y pasa a ser el par `(modified_at, transaction_id)`,
que sí es único y totalmente ordenable:

```sql
-- página siguiente, sin perder empatados
WHERE (modified_at, transaction_id) > ($1, $2)
ORDER BY modified_at, transaction_id
LIMIT 500
```

Y el watermark que se persiste se retrasa deliberadamente unos minutos, para volver a
barrer la zona donde pueden aparecer registros tardíos:

```ts
// ingestion-service/src/watermark.ts
const OVERLAP_MINUTES = 15;

export function nextWatermark(maxSeen: Date): Date {
  return new Date(maxSeen.getTime() - OVERLAP_MINUTES * 60_000);
}
```

Reprocesar 15 minutos en cada corrida es barato **porque la inserción es idempotente**
(punto 4). El solapamiento no crea duplicados, solo relee. Esta combinación
—cursor compuesto + solapamiento + idempotencia— es la que hace que la ingesta sea
correcta, y es exactamente lo que conviene saber explicar en una entrevista.

---

## 2. La hora es hora local de tienda, no UTC — BLOQUEANTE

La consulta del plan:

```sql
SELECT date_trunc('hour', trans_date) AS hora, ...
```

`trans_date` es `timestamptz`, así que `date_trunc` trunca en UTC. El gráfico de "ventas
por hora" muestra entonces la hora punta desplazada según el huso, y con tiendas en husos
distintos mezcla horas que no son comparables.

### Corrección

Guardar la zona horaria en la tienda y truncar en esa zona:

```sql
SELECT date_trunc('hour', t.trans_date AT TIME ZONE s.timezone) AS bucket,
       SUM(t.total_neto) AS sales,
       COUNT(*)          AS tickets
FROM transactions t
JOIN stores s ON s.store_id = t.store_id
WHERE t.trans_date >= $1 AND t.trans_date < $2
  AND NOT t.is_void
GROUP BY 1
ORDER BY 1;
```

Nota adicional sobre el rango: `BETWEEN $1 AND $2` del plan es inclusivo en ambos
extremos, así que una transacción exactamente a medianoche del día final entra en dos
rangos consecutivos. Usar siempre `>= inicio AND < fin`.

---

## 3. El cron se solapa consigo mismo — ALTA

"Cron cada 10 min" sin ningún tipo de exclusión mutua. El día que la carga tarde 12
minutos (justo el día de mucho volumen), habrá dos corridas simultáneas leyendo el mismo
watermark, duplicando trabajo y compitiendo por los mismos bloqueos.

### Corrección: advisory lock de PostgreSQL

```ts
// ingestion-service/src/lock.ts
const INGEST_LOCK_KEY = 4711;

export async function withIngestLock<T>(
  db: Db,
  run: () => Promise<T>,
): Promise<T | null> {
  const { rows } = await db.query(
    'SELECT pg_try_advisory_lock($1) AS acquired',
    [INGEST_LOCK_KEY],
  );
  if (!rows[0].acquired) {
    logger.info('ingesta ya en curso, se omite esta corrida');
    return null;
  }
  try {
    return await run();
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [INGEST_LOCK_KEY]);
  }
}
```

No requiere infraestructura extra: el lock vive en la misma base que ya se usa, y se
libera solo si el proceso muere.

---

## 4. Idempotencia real: cabecera **y** líneas — ALTA

El plan menciona `ON CONFLICT (transaction_id) DO NOTHING` para la transacción, pero no
dice nada de `transaction_lines`. Al releer la ventana de solapamiento del punto 1, las
líneas se duplicarían y **todas las métricas de unidades y de top de productos quedarían
infladas**.

### Corrección

Clave natural en las líneas y restricción única:

```sql
ALTER TABLE transaction_lines
  ADD CONSTRAINT transaction_lines_natural_key UNIQUE (transaction_id, line_num);
```

Y, para que una transacción corregida en el ERP se actualice en lugar de ignorarse:

```sql
INSERT INTO transactions (transaction_id, store_id, terminal_id, cashier_id,
                          trans_date, total_neto, payment_method, is_void, modified_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (transaction_id) DO UPDATE
  SET total_neto     = EXCLUDED.total_neto,
      is_void        = EXCLUDED.is_void,
      payment_method = EXCLUDED.payment_method,
      modified_at    = EXCLUDED.modified_at
WHERE transactions.modified_at < EXCLUDED.modified_at;
```

El `WHERE` final evita reescribir filas con datos más antiguos si llegan desordenadas, y
reduce la escritura real (y por tanto el WAL) cuando el solapamiento relee filas que no
cambiaron.

---

## 5. No agregar la tabla cruda en cada request — ALTA

Este es el punto central para "días con mucha interacción de información".

Con la consulta del plan, **cada** carga del dashboard escanea el rango completo de
`transactions`. Cinco widgets × N gerentes × auto-refresh = el mismo `GROUP BY` repetido
constantemente. Con 30 días de demo funciona; en un día de campaña con varias tiendas
consultando a la vez, la CPU de Postgres se satura y la caché solo tapa el problema
durante su TTL.

### Corrección: tabla de rollup por hora

La ingesta, que ya sabe exactamente qué horas tocó, refresca un agregado por
`(bucket_hora_local, store_id)`:

```sql
CREATE TABLE sales_hourly (
  bucket     timestamptz NOT NULL,   -- inicio de hora en hora LOCAL de la tienda
  store_id   text        NOT NULL,
  sales      numeric(14,2) NOT NULL,
  tickets    integer       NOT NULL,
  units      integer       NOT NULL,
  PRIMARY KEY (store_id, bucket)
);
CREATE INDEX sales_hourly_bucket_idx ON sales_hourly (bucket);
```

Recálculo solo de las horas afectadas por el lote recién ingerido:

```sql
-- $1 = array de buckets tocados por este lote
INSERT INTO sales_hourly (bucket, store_id, sales, tickets, units)
SELECT date_trunc('hour', t.trans_date AT TIME ZONE s.timezone),
       t.store_id,
       SUM(t.total_neto),
       COUNT(*),
       COALESCE(SUM(l.quantity), 0)
FROM transactions t
JOIN stores s ON s.store_id = t.store_id
LEFT JOIN transaction_lines l ON l.transaction_id = t.transaction_id
WHERE NOT t.is_void
  AND date_trunc('hour', t.trans_date AT TIME ZONE s.timezone) = ANY($1)
GROUP BY 1, 2
ON CONFLICT (store_id, bucket) DO UPDATE
  SET sales = EXCLUDED.sales,
      tickets = EXCLUDED.tickets,
      units = EXCLUDED.units;
```

Con esto:

- El gráfico "por hora" de 7 días y 5 tiendas lee **840 filas** en lugar de agregar
  decenas de miles.
- Los KPIs y "ventas por tienda" salen del mismo rollup con un `SUM` trivial.
- La vista por día es `date_trunc('day', bucket)` sobre el rollup horario.
- El coste de recalcular es proporcional al lote ingerido, no al rango consultado.

Solo `top de productos` necesita su propio rollup `product_daily (day, store_id, sku,
units, sales)`, con la misma mecánica.

> **Alternativa evaluada:** vista materializada con `REFRESH MATERIALIZED VIEW
> CONCURRENTLY`. Se descarta porque recalcula todo el histórico en cada refresco, que es
> justo el coste que queremos evitar en día de carga. El rollup incremental solo toca las
> horas que cambiaron.

### Índices sobre la tabla cruda

Siguen siendo necesarios para la ingesta, el recálculo y el export:

```sql
CREATE INDEX transactions_store_date_idx ON transactions (store_id, trans_date)
  WHERE NOT is_void;
CREATE INDEX transactions_modified_idx   ON transactions (modified_at, transaction_id);
CREATE INDEX transaction_lines_tx_idx    ON transaction_lines (transaction_id);
CREATE INDEX transaction_lines_sku_idx   ON transaction_lines (sku);
```

El índice parcial `WHERE NOT is_void` es más pequeño y cubre exactamente el predicado que
usan todas las agregaciones. El plan original solo menciona índices en `trans_date` y
`store_id` por separado: el compuesto en ese orden es el que sirve para "una tienda en un
rango".

---

## 6. El predicado opcional inhibe el índice — ALTA

```sql
AND ($3::text IS NULL OR store_id = $3)
```

PostgreSQL planifica esta consulta una sola vez para ambos casos. Cuando hay un
`store_id` concreto, el planificador a menudo no puede usar el índice compuesto por ese
`OR` y acaba en un scan secuencial. Es un patrón que funciona bien en desarrollo con
pocos datos y se degrada justo cuando importa.

### Corrección

Usar un array y `= ANY`, que sí es sargable y además soporta selección múltiple de
tiendas sin cambiar la firma:

```sql
AND (cardinality($3::text[]) = 0 OR store_id = ANY($3::text[]))
```

O, más simple y explícito, construir el predicado en el servicio:

```ts
const where = ['trans_date >= $1', 'trans_date < $2', 'NOT is_void'];
const params: unknown[] = [from, to];

if (storeIds.length > 0) {
  params.push(storeIds);
  where.push(`store_id = ANY($${params.length}::text[])`);
}

const sql = `SELECT ... FROM sales_hourly WHERE ${where.join(' AND ')} ...`;
```

Sigue siendo parametrizado —no hay concatenación de valores, así que no hay riesgo de
inyección—, pero cada forma de consulta obtiene su propio plan.

---

## 7. Caché: estampida y claves — ALTA

"Redis TTL 1–5 min por consulta" tiene dos problemas en pico de carga:

- **Estampida.** Al expirar la clave del widget más consultado, todas las peticiones en
  vuelo fallan la caché a la vez y golpean Postgres simultáneamente. Es el momento exacto
  en que el dashboard se cae.
- **Expiración sincronizada.** Si todas las claves se crean en el mismo despliegue con el
  mismo TTL, expiran todas juntas.

### Corrección: stale-while-revalidate + lock + jitter

```ts
// analytics-service/src/cache/swr.ts
const FRESH_MS = 60_000;   // se sirve directo
const STALE_MS = 600_000;  // se sirve caducado mientras se recalcula

export async function cached<T>(
  key: string,
  compute: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const hit = await redis.get(key);

  if (hit) {
    const entry = JSON.parse(hit) as { at: number; value: T };
    const age = Date.now() - entry.at;

    if (age < FRESH_MS) return { value: entry.value, cached: true };

    // Caducado pero utilizable: un solo proceso recalcula, el resto sigue sirviendo.
    if (await redis.set(`${key}:lock`, '1', 'PX', 30_000, 'NX')) {
      void refresh(key, compute).catch((err) =>
        logger.error({ err, key }, 'fallo al refrescar caché'),
      );
    }
    return { value: entry.value, cached: true };
  }

  return { value: await refresh(key, compute), cached: false };
}

async function refresh<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const value = await compute();
  const jitter = Math.floor(Math.random() * 30_000); // evita expiración sincronizada
  await redis.set(
    key,
    JSON.stringify({ at: Date.now(), value }),
    'PX',
    STALE_MS + jitter,
  );
  return value;
}
```

**Clave de caché.** Debe ser determinista y contener todo lo que afecta al resultado:

```ts
const key = [
  'dash', 'v3',                 // versión del formato: subir invalida todo de golpe
  await getDataVersion(),       // contador que la ingesta incrementa al cerrar lote
  widget,
  from, to,
  granularity,
  storeIds.slice().sort().join(','),  // ordenado: el orden del filtro no crea claves nuevas
].join(':');
```

`getDataVersion()` (un `INCR` en Redis al final de cada ingesta) hace que los datos
nuevos aparezcan al instante sin esperar el TTL, y evita tener que invalidar clave por
clave.

---

## 8. Frontend: menos peticiones y menos trabajo repetido — ALTA

Cinco widgets con su propia query significan 5 o 6 peticiones **por cada pulsación** en
el selector de fechas. Con auto-refresh y varios gerentes abiertos, eso multiplica la
carga sin aportar nada.

### 8.1 Un endpoint agregado, varias queries en el front

`GET /dashboard/summary` devuelve el `DashboardSummary` completo en una sola petición.
En el front se usa una query única y cada widget lee su porción con `select`, de modo que
un widget solo se vuelve a renderizar si **su** trozo cambió:

```ts
// web/src/features/dashboard/useDashboard.ts
export function useDashboard<T>(select: (d: DashboardSummary) => T) {
  const filters = useDashboardFilters();          // leídos de la URL
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: ({ signal }) => fetchSummary(filters, signal),
    select,
    staleTime: 60_000,                             // alineado con FRESH_MS del servidor
    placeholderData: keepPreviousData,             // sin parpadeo al cambiar filtros
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
```

```ts
const { data: kpis } = useDashboard((d) => d.kpis);
const { data: byHour } = useDashboard((d) => d.byBucket);
```

### 8.2 Debounce y cancelación

El selector de rango dispara en cada clic. Se aplica debounce de 300 ms antes de escribir
en la URL, y el `signal` de la query aborta la petición anterior cuando llega una nueva.
Sin esto, arrastrar el calendario lanza una decena de consultas pesadas de las que solo
interesa la última.

### 8.3 Auto-refresh honesto

```ts
refetchInterval: () => (document.hidden ? false : 60_000),
```

Una pestaña en segundo plano no debe seguir consultando. En una oficina con diez
pantallas abiertas todo el día, esto es la diferencia entre carga constante y carga real.

### 8.4 Nunca mandar filas crudas al gráfico

Recharts renderiza en SVG: por encima de unos pocos cientos de puntos, el navegador se
arrastra. La agregación y el límite de puntos son siempre responsabilidad del servidor
(por eso `granularity` es derivada y tope, ver el documento de diseño). El front no
adelgaza datos: los recibe ya adelgazados.

---

## 9. Export CSV en streaming — ALTA

`GET /export.csv` construyendo un array en memoria es un `out of memory` esperando el día
en que alguien exporte el trimestre completo.

### Corrección

Cursor de servidor y escritura por chunks, con tope duro de filas:

```ts
// analytics-service/src/export.ts
const MAX_EXPORT_ROWS = 100_000;

export async function exportCsv(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ventas.csv"');
  res.write('﻿');                 // BOM: Excel abre bien los acentos
  res.write('fecha,tienda,terminal,cajero,ticket,total,medio_pago\n');

  const cursor = client.query(new Cursor(EXPORT_SQL, params));
  let sent = 0;

  for (;;) {
    const rows = await readCursor(cursor, 500);
    if (rows.length === 0) break;

    for (const row of rows) {
      res.write(toCsvLine(row));
      if (++sent >= MAX_EXPORT_ROWS) {
        res.write(`# truncado en ${MAX_EXPORT_ROWS} filas\n`);
        return res.end();
      }
    }
    // respeta la contrapresión: no acumula en memoria si el cliente va lento
    if (!res.write('')) await once(res, 'drain');
  }
  res.end();
}
```

Si el requisito crece a exportaciones grandes, el siguiente paso es encolar el export en
BullMQ (que el stack ya contempla) y devolver un enlace de descarga cuando termine, en
lugar de mantener una conexión HTTP abierta varios minutos.

---

## 10. Inserción por lotes en la ingesta — MEDIA

Un `INSERT` por transacción con su ida y vuelta a la base convierte 5 000 transacciones
en 5 000 round-trips. Se inserta en lotes, dentro de una transacción por lote:

```ts
const CHUNK = 500;

for (const chunk of chunks(transactions, CHUNK)) {
  await db.query('BEGIN');
  await db.query(buildMultiRowInsert(chunk), flatten(chunk));
  await db.query(buildLinesInsert(linesOf(chunk)), flattenLines(chunk));
  await db.query('COMMIT');
}
```

Para cargas iniciales grandes (los 30 días de historia del simulador), `COPY` vía
`pg-copy-streams` es un orden de magnitud más rápido; después se aplican las claves
únicas y los índices. Crear índices **después** de la carga inicial, no antes.

---

## 11. Particionado y retención — MEDIA

Una tabla de transacciones que solo crece termina con índices que no caben en memoria y
con un `VACUUM` cada vez más caro.

```sql
CREATE TABLE transactions (
  ...
) PARTITION BY RANGE (trans_date);

CREATE TABLE transactions_2026_09 PARTITION OF transactions
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

Ventajas concretas: las consultas por rango podan particiones automáticamente, y borrar
histórico es `DROP TABLE` de una partición (instantáneo) en lugar de un `DELETE` masivo
que deja la tabla hinchada. La creación de la partición del mes siguiente es una tarea
programada más del `ingestion-service`.

Política de retención propuesta para el MVP: 13 meses de detalle en `transactions`
(permite comparar contra el mismo mes del año anterior), rollups conservados
indefinidamente porque ocupan poquísimo.

---

## 12. Límites en el gateway — MEDIA

Sin estos, un solo cliente mal configurado tumba el servicio:

- **Rango máximo** de 366 días, rechazado con `400` y mensaje claro. Es la primera
  defensa: una consulta que no se acepta no hay que optimizarla.
- **Rate limiting** por token, por ejemplo 60 peticiones por minuto, con
  `express-rate-limit` respaldado por Redis para que funcione con varias instancias.
- **Timeout de consulta** en el pool: `statement_timeout = 10s`. Una consulta que tarda
  más está mal planteada; mejor fallar rápido que ocupar una conexión.
- **Tamaño del pool** acotado (`max: 10` por instancia). Más conexiones no dan más
  rendimiento en Postgres: dan más contención.
- **Compresión** `gzip`/`brotli` en las respuestas JSON del dashboard.
- **Paginación obligatoria** en cualquier endpoint que devuelva listas.

---

## 13. Observabilidad — MEDIA

Sin medición, "optimizar" es adivinar. Lo mínimo:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

```sql
-- las 10 consultas que más tiempo total consumen
SELECT calls, round(mean_exec_time::numeric, 1) AS media_ms,
       round(total_exec_time::numeric) AS total_ms, query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

En la aplicación: middleware con Pino que registra `{ route, durationMs, cached,
rowCount, requestId }` por petición, y un log de advertencia por encima de 500 ms. El
`requestId` es el mismo que se muestra en el estado de error de la interfaz, así que un
usuario puede reportar un problema y se localiza en los logs de inmediato.

Antes de dar por buena cualquier consulta, `EXPLAIN (ANALYZE, BUFFERS)` sobre datos
realistas —los 30 días del simulador, no tres filas de prueba—.

---

## 14. Plan de mejora por fases

Las fases 0 y 1 son las que hay que hacer sí o sí; las demás se pueden dejar
documentadas como "siguiente paso" si el tiempo aprieta.

### Fase 0 — Correcciones de corrección (antes de escribir el front)

| Acción | Hallazgo | Esfuerzo |
|---|---|---|
| Cursor compuesto + solapamiento en el watermark | 1 | 3 h |
| Zona horaria por tienda en todas las agregaciones | 2 | 2 h |
| Advisory lock en el job de ingesta | 3 | 1 h |
| Clave natural única en `transaction_lines` + upsert condicional | 4 | 2 h |

### Fase 1 — Rendimiento base (durante la etapa 4 del plan)

| Acción | Hallazgo | Esfuerzo |
|---|---|---|
| Tabla `sales_hourly` + recálculo incremental | 5 | 6 h |
| Rollup `product_daily` | 5 | 3 h |
| Índices compuestos y parciales | 5 | 1 h |
| Predicado de tienda con `= ANY` | 6 | 1 h |
| Caché SWR con lock y `dataVersion` | 7 | 4 h |
| Inserción por lotes / `COPY` en carga inicial | 10 | 2 h |

### Fase 2 — Frontend bajo carga (durante la etapa 5)

| Acción | Hallazgo | Esfuerzo |
|---|---|---|
| Endpoint `/dashboard/summary` + `select` por widget | 8.1 | 4 h |
| Debounce de filtros y cancelación con `AbortSignal` | 8.2 | 2 h |
| Auto-refresh pausado en pestaña oculta | 8.3 | 30 min |
| Granularidad derivada con tope de puntos | 8.4 | 2 h |
| Export CSV en streaming con tope de filas | 9 | 3 h |

### Fase 3 — Operación (etapa 6, y ya vale como sección del README)

| Acción | Hallazgo | Esfuerzo |
|---|---|---|
| Particionado mensual + tarea de creación de partición | 11 | 4 h |
| Rate limiting, `statement_timeout`, tope de rango | 12 | 3 h |
| `pg_stat_statements` + logging de duración con `requestId` | 13 | 2 h |
| Prueba de carga con k6 y objetivo p95 documentado | — | 4 h |

---

## 15. Cómo se verifica que la optimización sirvió

Sin número antes y después, no hay optimización que demostrar. Escenario de prueba
reproducible:

- **Datos:** 90 días, 5 tiendas, ~8 000 transacciones/día con curva de hora punta
  (el `pos-simulator` ya está pensado para esto).
- **Carga:** k6, 20 usuarios virtuales durante 3 minutos alternando rangos y tiendas,
  con un 20 % de peticiones a rangos no cacheados.
- **Objetivos:** p95 < 300 ms con caché caliente, p95 < 1 s en fallo de caché, 0 errores,
  CPU de Postgres por debajo del 70 %.

Tres medidas: (a) plan original, (b) tras la fase 1, (c) tras la fase 2. Esa tabla de
antes/después es material directo para el README y para la entrevista: convierte
"optimicé consultas" en "reduje el p95 de X a Y bajo 20 usuarios concurrentes".

---

## 16. Tests que cubren específicamente estos riesgos

| Test | Qué protege |
|---|---|
| Ingesta de un lote con 600 transacciones que comparten el mismo `modified_at` | Hallazgo 1: ninguna se pierde al cortar la página |
| Ejecutar el job dos veces seguidas sobre el mismo lote | Hallazgo 4: los totales no cambian (idempotencia) |
| Transacción de una tienda en otro huso horario | Hallazgo 2: cae en el bucket de hora local correcto |
| Dos corridas del job en paralelo | Hallazgo 3: la segunda se omite limpiamente |
| Comparación rollup vs agregación directa sobre la tabla cruda | Hallazgo 5: el rollup no miente |
| Ticket anulado y ticket de devolución | KPIs: no suman ventas, las unidades restan |
| Rango de 400 días | Hallazgo 12: responde `400`, no intenta calcularlo |
| Export con más filas que el tope | Hallazgo 9: trunca y cierra, no agota memoria |
