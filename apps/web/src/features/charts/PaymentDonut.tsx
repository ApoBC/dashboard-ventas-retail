import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { useDashboard } from "@/features/filters/useDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/Skeleton";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function PaymentDonut() {
  const { data: paymentMix, isLoading } = useDashboard((d) => d.paymentMix);

  if (isLoading || !paymentMix) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-48 w-full rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">Medios de pago</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={paymentMix}
              dataKey="sales"
              nameKey="method"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={2}
              label={({ method, share }: { method: string; share: number }) =>
                `${method} ${share}%`
              }
              labelLine={false}
            >
              {paymentMix.map((_entry, index) => (
                <Cell
                  key={index}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-gray-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ErrorBoundary>
  );
}
