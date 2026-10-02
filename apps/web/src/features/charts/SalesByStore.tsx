import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboard } from "@/features/filters/useDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/Skeleton";

export function SalesByStore() {
  const { data: byStore, isLoading } = useDashboard((d) => d.byStore);

  if (isLoading || !byStore) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <Skeleton className="h-4 w-36 mb-2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">Ventas por tienda</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byStore} layout="vertical">
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
            />
            <YAxis
              dataKey="storeName"
              type="category"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              formatter={(value: number) => [`S/ ${value.toLocaleString()}`, "Ventas"]}
            />
            <Bar
              dataKey="sales"
              fill="var(--chart-1)"
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ErrorBoundary>
  );
}
