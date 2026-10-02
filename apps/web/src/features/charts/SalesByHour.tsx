import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboard } from "@/features/filters/useDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/Skeleton";

export function SalesByHour() {
  const { data: byBucket, isLoading } = useDashboard((d) => d.byBucket);
  const { data: meta } = useDashboard((d) => d.meta);

  if (isLoading || !byBucket) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const chartData = byBucket.map((b) => ({
    bucket: new Date(b.bucket).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    sales: Math.round(b.sales),
    tickets: b.tickets,
  }));

  return (
    <ErrorBoundary>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-1">Ventas por hora</h3>
        <p className="text-xs text-gray-400 mb-3">
          Hora local de tienda
          {meta?.cached && ` · datos de hace ${timeSince(meta.generatedAt)}`}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
            />
            <Tooltip
              formatter={(value: number) => [`S/ ${value.toLocaleString()}`, "Ventas"]}
            />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ErrorBoundary>
  );
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "< 1 min";
  return `${mins} min`;
}
