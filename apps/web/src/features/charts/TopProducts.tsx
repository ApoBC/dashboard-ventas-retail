import { useDashboard } from "@/features/filters/useDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/Skeleton";
import { formatNumber, formatCurrency } from "@/lib/format";

export function TopProducts() {
  const { data: topProducts, isLoading } = useDashboard((d) => d.topProducts);

  if (isLoading || !topProducts) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <Skeleton className="h-4 w-36 mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full mb-2" />
        ))}
      </div>
    );
  }

  const maxUnits = topProducts[0]?.units ?? 1;

  return (
    <ErrorBoundary>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">Top 10 productos</h3>
        <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left font-normal pb-2 w-[40%]">Producto</th>
              <th className="font-normal pb-2 w-[35%]" />
              <th className="text-right font-normal pb-2 w-[12%]">Uds.</th>
              <th className="text-right font-normal pb-2 w-[13%]">Venta</th>
            </tr>
          </thead>
          <tbody>
            {topProducts.map((p) => (
              <tr key={p.sku} className="border-b border-gray-50">
                <td className="py-1.5 text-gray-600 truncate" title={p.name}>
                  {p.name}
                </td>
                <td className="py-1.5 px-2">
                  <div className="w-full bg-gray-100 rounded-sm h-2">
                    <div
                      className="h-2 rounded-sm"
                      style={{
                        width: `${(p.units / maxUnits) * 100}%`,
                        backgroundColor: "var(--chart-2)",
                      }}
                    />
                  </div>
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatNumber(p.units)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatCurrency(p.sales)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ErrorBoundary>
  );
}
