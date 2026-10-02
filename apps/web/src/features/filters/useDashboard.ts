import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchDashboardSummary } from "@/lib/api";
import { useDashboardFilters } from "./useDashboardFilters";
import type { DashboardSummary } from "@retail/shared";

/**
 * Hook central del dashboard. Una sola query, y cada widget usa `select`
 * para leer su porción. Así:
 *
 * - Un cambio de filtro dispara UNA petición, no 5 o 6. (Hallazgo 8.1)
 * - `keepPreviousData` evita el parpadeo al cambiar filtros: los datos
 *   anteriores siguen visibles hasta que llegan los nuevos. (Sección 5
 *   del doc de diseño: estado "Refrescando")
 * - `refetchInterval` se pausa en pestaña oculta. (Hallazgo 8.3)
 * - El `signal` de la query aborta la petición anterior. (Hallazgo 8.2)
 */

export function useDashboard<T>(select: (d: DashboardSummary) => T) {
  const { filters } = useDashboardFilters();

  return useQuery({
    queryKey: ["dashboard", filters],
    queryFn: ({ signal }) =>
      fetchDashboardSummary(
        {
          from: filters.from,
          to: filters.to,
          store: filters.store,
          granularity: filters.granularity,
        },
        signal,
      ),
    select,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    refetchInterval: () => (document.hidden ? false : 60_000),
    retry: 2,
  });
}
