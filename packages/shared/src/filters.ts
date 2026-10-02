import { z } from "zod";

/** Esquema Zod de los filtros del dashboard. Se usa idéntico en el front
 *  (validar query string) y en el backend (validar la request). Un solo
 *  sitio donde cambia la regla. */

const MAX_RANGE_DAYS = 366;
const MAX_HOURLY_RANGE_DAYS = 7;

export const dashboardFiltersSchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
      .optional(),
    store: z.string().default("all"),
    granularity: z.enum(["hour", "day"]).optional(),
  })
  .transform((raw) => {
    const now = new Date();
    const toDate = raw.to ? new Date(raw.to) : now;
    const fromDate = raw.from
      ? new Date(raw.from)
      : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rangeDays = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    // Granularidad derivada: "hour" solo si el rango <= 7 días
    const granularity =
      raw.granularity === "hour" && rangeDays <= MAX_HOURLY_RANGE_DAYS
        ? "hour"
        : rangeDays <= MAX_HOURLY_RANGE_DAYS
          ? (raw.granularity ?? "hour")
          : "day";

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      store: raw.store,
      granularity,
      rangeDays,
    };
  })
  .refine((v) => v.rangeDays >= 0, {
    message: "from debe ser anterior o igual a to",
  })
  .refine((v) => v.rangeDays <= MAX_RANGE_DAYS, {
    message: `Rango máximo: ${MAX_RANGE_DAYS} días`,
  });

export type DashboardFilters = z.output<typeof dashboardFiltersSchema>;

export { MAX_RANGE_DAYS, MAX_HOURLY_RANGE_DAYS };
