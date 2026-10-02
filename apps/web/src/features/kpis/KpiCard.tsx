import { formatCompactCurrency, formatNumber, formatPercent, pctChange } from "@/lib/format";
import { Skeleton } from "@/components/Skeleton";

type Props = {
  label: string;
  value: number | undefined;
  previousValue: number | undefined;
  isCurrency?: boolean;
  isLoading: boolean;
};

/**
 * Tarjeta de KPI con variación porcentual.
 *
 * - Flecha ▲/▼ además del color, para accesibilidad. (Sección 6)
 * - tabular-nums para que los números no "bailen" al refrescar.
 * - El color nunca es el único portador de significado.
 */
export function KpiCard({ label, value, previousValue, isCurrency, isLoading }: Props) {
  if (isLoading || value === undefined || previousValue === undefined) {
    return (
      <div className="bg-gray-100 rounded-lg p-4">
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-7 w-24" />
      </div>
    );
  }

  const change = pctChange(value, previousValue);
  const formatted = isCurrency ? formatCompactCurrency(value) : formatNumber(value);

  return (
    <div className="bg-gray-100 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-medium">{formatted}</p>
      {change !== null && (
        <p
          className={`text-xs mt-1 ${change >= 0 ? "text-green-600" : "text-red-600"}`}
        >
          {change >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(change))}
        </p>
      )}
    </div>
  );
}
