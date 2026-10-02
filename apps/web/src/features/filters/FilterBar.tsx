import { useQuery } from "@tanstack/react-query";
import { fetchStores } from "@/lib/api";
import { useDashboardFilters } from "./useDashboardFilters";

/**
 * Barra de filtros sticky: rango de fechas + tienda + botón de exportar.
 * El estado vive en la URL, no en useState local.
 */
export function FilterBar() {
  const { filters, setFilter } = useDashboardFilters();
  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: fetchStores,
    staleTime: Infinity,
  });

  const handleExport = () => {
    const params = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      store: filters.store,
    });
    window.open(`/api/export.csv?${params}`, "_blank");
  };

  return (
    <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl px-4 py-2.5 mb-3 flex flex-wrap items-center gap-3">
      <h1 className="text-sm font-medium mr-auto">Ventas retail</h1>

      <label className="text-xs text-gray-500">
        Desde
        <input
          type="date"
          defaultValue={filters.from}
          onChange={(e) => setFilter("from", e.target.value)}
          className="ml-1 text-xs border border-gray-300 rounded px-2 py-1"
        />
      </label>

      <label className="text-xs text-gray-500">
        Hasta
        <input
          type="date"
          defaultValue={filters.to}
          onChange={(e) => setFilter("to", e.target.value)}
          className="ml-1 text-xs border border-gray-300 rounded px-2 py-1"
        />
      </label>

      <select
        defaultValue={filters.store}
        onChange={(e) => setFilter("store", e.target.value)}
        className="text-xs border border-gray-300 rounded px-2 py-1"
      >
        <option value="all">Todas las tiendas</option>
        {stores?.map((s) => (
          <option key={s.store_id} value={s.store_id}>
            {s.name}
          </option>
        ))}
      </select>

      <button
        onClick={handleExport}
        className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
        title="Exportar a CSV"
      >
        ↓ CSV
      </button>
    </div>
  );
}
