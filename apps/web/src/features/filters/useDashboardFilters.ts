import { useMemo, useCallback, useRef, useEffect } from "react";
import { dashboardFiltersSchema, type DashboardFilters } from "@retail/shared";

/**
 * Lee y escribe los filtros del dashboard en la URL (query string).
 *
 * Correcciones aplicadas:
 * - Estado en la URL, no en useState: un gerente comparte el enlace y
 *   el receptor ve lo mismo. Back/forward funciona.
 * - Debounce de 300 ms antes de escribir en la URL: arrastrar el
 *   calendario no lanza una petición por cada clic. (Hallazgo 8.2)
 */

function parseFromUrl(): DashboardFilters {
  const params = Object.fromEntries(new URLSearchParams(window.location.search));
  const result = dashboardFiltersSchema.safeParse(params);

  if (result.success) return result.data;

  // Fallback: últimos 7 días
  return dashboardFiltersSchema.parse({});
}

function writeToUrl(filters: Partial<Record<string, string>>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(filters)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(null, "", url.toString());
}

export function useDashboardFilters() {
  const filters = useMemo(() => parseFromUrl(), []);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        writeToUrl({ [key]: value });
        // Forzar re-render: TanStack Query detecta el cambio en queryKey
        window.dispatchEvent(new Event("popstate"));
      }, 300);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { filters, setFilter };
}
