# Proyecto 03 — Diseño del dashboard de ventas retail

> Complementa `03-dashboard-ventas-retail.md`, etapa 0 (Diseño). El plan original pide
> un "boceto del dashboard" pero no define qué se boceta ni sobre qué base. Este
> documento cierra ese hueco: base de diseño elegida, layout, jerarquía, estados y
> contrato de datos.

---

## 1. No diseñar desde cero: base elegida

Dibujar un dashboard en Figma desde un lienzo en blanco es el error más caro de este
proyecto: dura 2 semanas y su riesgo declarado #3 es justamente "gastar mucho tiempo en
estilos". La decisión correcta es partir de un bloque ya diseñado y validado.

### Opciones evaluadas

| Base | Qué aporta | Costo | Riesgo |
|---|---|---|---|
| **shadcn/ui blocks + shadcn charts** | Layout de dashboard completo y gráficos sobre Recharts, con tokens de color, modo oscuro y accesibilidad ya resueltos. El código se copia al repo, no es dependencia. | Gratis, MIT | Ninguno relevante |
| Tremor | Componentes de analítica muy pulidos (KPI, bar list, spark) | Gratis | Segunda librería de UI conviviendo con shadcn: duplica tokens y estilos |
| MUI X Charts | Muy completo, buena documentación | Gratis (Pro de pago) | Estética Material choca con el stack Tailwind del plan |
| Plantilla comprada | Acabado alto | De pago | No aporta nada al CV; código ajeno que hay que explicar |
| Diseño propio en Figma | Control total | 2–3 días | Consume el 20 % del proyecto en estilos |

### Decisión

**shadcn/ui blocks + shadcn charts (Recharts por debajo).** Razones:

1. El plan ya elige Tailwind + shadcn/ui y Recharts, así que no se introduce nada nuevo
   al stack.
2. El componente `chart` instala un wrapper (`ChartContainer`, `ChartTooltip`,
   `ChartLegend`) que estandariza colores mediante variables CSS `--chart-1` a
   `--chart-5`. Eso resuelve de una vez la coherencia de paleta entre los cuatro
   gráficos, que es donde más se nota un dashboard hecho a trozos.
3. Los bloques de dashboard traen el esqueleto de layout (header, grid de cards,
   responsive) ya montado. Se adapta, no se inventa.

Arranque:

```bash
pnpm dlx shadcn@latest init
```

```bash
pnpm dlx shadcn@latest add card chart button calendar popover select table skeleton badge
```

El catálogo de bloques cambia entre versiones, así que conviene listar lo disponible en
la versión instalada antes de elegir:

```bash
pnpm dlx shadcn@latest add
```

> **Qué se adapta y qué no.** Se conserva la estructura y los tokens; se eliminan los
> datos de ejemplo y las secciones que este MVP no tiene (usuarios, ajustes, facturación)
> y se sustituye la barra superior por el contrato de filtros de la sección 4. Copiar un
> bloque entero con sus páginas muertas es peor que no usarlo.

---

## 2. Antes del layout: definir los KPIs con precisión

Un dashboard falla cuando dos personas leen "ticket promedio" y entienden cosas
distintas. La definición se fija **antes** de escribir el SQL.

| KPI | Fórmula | Unidad | Nota |
|---|---|---|---|
| Ventas totales | `SUM(total_neto)` de tickets no anulados | moneda | Excluir `is_void = true` |
| Tickets | `COUNT(*)` de tickets no anulados | entero | Cuenta tickets, no líneas |
| Ticket promedio | `ventas_totales / tickets` | moneda | Se calcula en SQL, no en el front: evita la división por cero y los promedios de promedios |
| Unidades vendidas | `SUM(quantity)` de líneas | entero | Las devoluciones restan (cantidad negativa) |
| Variación vs periodo anterior | `(actual - anterior) / NULLIF(anterior, 0)` | % | El periodo anterior es del **mismo largo** y termina justo antes del inicio del actual |

Dos decisiones que evitan bugs clásicos:

- **Devoluciones.** Se modelan como líneas con cantidad e importe negativos dentro de un
  ticket de tipo `RETURN`, no como una tabla aparte. Así todas las agregaciones las
  incorporan sin lógica adicional y los totales cuadran siempre.
- **Zona horaria.** "Ventas por hora" tiene que ser la hora **local de la tienda**, no
  UTC. Cada tienda guarda su `timezone` (IANA, por ejemplo `America/Lima`) y las
  agregaciones hacen `trans_date AT TIME ZONE s.timezone`. Sin esto, un dashboard con
  tiendas en husos distintos muestra la hora punta desplazada y nadie entiende por qué.

---

## 3. Layout

Rejilla de 12 columnas, ancho máximo 1440 px, separación 24 px, radio de card 12 px.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Ventas retail            [Últimos 7 días ▾] [Tienda: Todas ▾] [Exportar]│  ← sticky
├──────────────────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐                  │
│ │ Ventas    │ │ Tickets   │ │ Ticket    │ │ Unidades  │   4 × col-3      │
│ │ S/ 148.2k │ │   3 412   │ │ promedio  │ │  9 877    │                  │
│ │ ▲ 12,4 %  │ │ ▲ 4,1 %   │ │ S/ 43,44  │ │ ▼ 2,0 %   │                  │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘                  │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ ┌─────────────────────────┐ │
│ │ Ventas por hora              (área)      │ │ Medios de pago (donut)  │ │
│ │              col-8                       │ │        col-4            │ │
│ └──────────────────────────────────────────┘ └─────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐ ┌─────────────────────────────────────────┐ │
│ │ Ventas por tienda        │ │ Top 10 productos (tabla + barra inline) │ │
│ │ (barra horizontal) col-5 │ │                col-7                    │ │
│ └──────────────────────────┘ └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Reglas del layout:

- **Una sola pantalla para lo esencial.** Los KPIs y "ventas por hora" caben sin scroll
  en 1080p. Todo lo demás vive por debajo del pliegue.
- **Orden por jerarquía, no por estética.** Arriba el "cuánto" (KPIs), en medio el
  "cuándo" (hora), abajo el "dónde" y el "qué" (tienda, producto).
- **Barra de filtros sticky.** Cambiar de rango no debe obligar a volver arriba.
- **Responsive.** Por debajo de 768 px todo pasa a una columna, los KPIs a 2×2 y el top
  de productos se convierte en lista. Los gráficos usan `aspect-ratio` en lugar de altura
  fija para no aplastarse en móvil.

### Elección de gráfico por pregunta

| Pregunta que responde | Marca | Por qué no otra |
|---|---|---|
| ¿Cómo se distribuye la venta en el día? | Área o línea, eje X = hora | 24 barras generan ruido y ocultan la tendencia |
| ¿Qué tienda vende más? | Barra **horizontal** ordenada desc. | La vertical corta o rota los nombres de tienda |
| ¿Qué productos se venden? | Tabla con barra inline | Un top-10 en barras desperdicia media pantalla y no deja mostrar unidades e importe a la vez |
| ¿Cómo paga la gente? | Donut con máximo 5 categorías + "Otros" | Un pie con 9 sectores es ilegible |

Todos los gráficos comparten la misma escala de color (`--chart-1` a `--chart-5`) y el
mismo formateo de moneda y fecha, definido una sola vez en `lib/format.ts` con
`Intl.NumberFormat` y `date-fns` con un locale único.

---

## 4. Estado en la URL

Los filtros viven en la query string, no en `useState`. Un gerente comparte el enlace y
quien lo recibe ve exactamente lo mismo; además el back/forward del navegador funciona y
TanStack Query cachea por una clave estable.

```
/dashboard?from=2026-09-01&to=2026-09-28&store=LIM-01&granularity=day
```

Contrato de parámetros:

| Param | Tipo | Default | Validación |
|---|---|---|---|
| `from`, `to` | `YYYY-MM-DD` | últimos 7 días | `from <= to`, rango máximo 366 días |
| `store` | id de tienda o `all` | `all` | Debe existir en el catálogo |
| `granularity` | `hour` \| `day` | derivada del rango | `hour` solo si el rango es ≤ 7 días |

La validación se hace con un esquema Zod en `packages/shared`, y **el mismo esquema**
valida la query en el backend. Un solo sitio donde cambia la regla.

> La granularidad derivada no es un detalle: pedir "por hora" sobre 90 días devuelve
> 2 160 puntos que ningún gráfico puede mostrar y ninguna consulta debería calcular en
> caliente. Por encima de 7 días se agrupa por día automáticamente y la interfaz lo
> indica en el subtítulo del gráfico, para que el cambio no sea invisible.

---

## 5. Estados de la interfaz

Cada widget implementa los cuatro estados. Esto es lo que separa un dashboard de demo de
uno que parece un producto.

| Estado | Tratamiento |
|---|---|
| **Cargando (primera vez)** | `Skeleton` con la forma final del componente. Nunca un spinner centrado a pantalla completa. |
| **Refrescando (ya hay datos)** | Los datos previos siguen visibles con opacidad reducida y una barra de progreso fina en el borde superior de la card. Sin parpadeo ni salto de layout. |
| **Vacío** | Frase concreta: "No hay ventas para LIM-01 entre el 1 y el 7 de septiembre", más un botón "Ampliar rango". Nunca un "No data" suelto. |
| **Error** | Mensaje corto, el `requestId` en texto pequeño y un botón "Reintentar" que reintenta solo ese widget. |

Cada card se envuelve en su propio `ErrorBoundary`: un gráfico caído no tumba el
dashboard entero. Ese aislamiento por widget es la razón por la que conviene que cada
gráfico conserve su propia query aunque el transporte esté agrupado (ver
`03-dashboard-rendimiento.md`, sección 4).

---

## 6. Accesibilidad y legibilidad

- El color nunca es el único portador de significado: las variaciones llevan flecha
  (▲/▼) además del verde o rojo, y el donut lleva etiqueta con porcentaje.
- Cada gráfico expone una tabla equivalente para lector de pantalla (`<table>` con clase
  `sr-only`) o, como mínimo, un `aria-label` con el resumen numérico.
- Contraste mínimo 4.5:1 en texto; los tokens de shadcn ya lo cumplen en ambos temas.
- Foco visible en todos los controles de filtro, y el selector de fechas operable con
  teclado.
- Los números grandes usan `tabular-nums` para que no "bailen" al refrescar.

---

## 7. Contrato de datos del front

El front nunca recibe filas crudas. Cada endpoint devuelve exactamente lo que el gráfico
pinta, ya agregado y ya convertido a la zona horaria correcta.

```ts
// packages/shared/src/dashboard.ts
export type KpiBlock = {
  sales: number;
  tickets: number;
  avgTicket: number;
  units: number;
};

export type Kpis = KpiBlock & { previous: KpiBlock };

export type SalesByBucket = { bucket: string; sales: number; tickets: number }[];
export type SalesByStore = { storeId: string; storeName: string; sales: number }[];
export type TopProducts = { sku: string; name: string; units: number; sales: number }[];
export type PaymentMix = { method: string; sales: number; share: number }[];

export type DashboardSummary = {
  kpis: Kpis;
  byBucket: SalesByBucket;
  byStore: SalesByStore;
  topProducts: TopProducts;
  paymentMix: PaymentMix;
  meta: {
    granularity: 'hour' | 'day';
    timezone: string;
    generatedAt: string;
    cached: boolean;
  };
};
```

`meta.cached` y `meta.generatedAt` se muestran en una esquina del dashboard ("Datos de
hace 2 min"). Es honesto con quien lo usa y, en una entrevista, demuestra que entiendes
que un dashboard con caché no es tiempo real y que esa diferencia hay que comunicarla.

---

## 8. Checklist de la etapa de diseño

- [ ] Bloque de shadcn elegido y copiado al repo, con los datos y páginas de ejemplo eliminados
- [ ] `lib/format.ts` con formateo único de moneda, número y fecha
- [ ] Tokens `--chart-1` a `--chart-5` definidos para tema claro y oscuro
- [ ] Definición escrita de los 5 KPIs (sección 2) acordada antes de escribir SQL
- [ ] Esquema Zod de filtros compartido entre front y back
- [ ] Los cuatro estados implementados en un widget de referencia y luego replicados
- [ ] Prueba a 375 px de ancho sin scroll horizontal
- [ ] Captura del dashboard con datos realistas para el README
