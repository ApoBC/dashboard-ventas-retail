import { useDashboard } from "@/features/filters/useDashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KpiCard } from "./KpiCard";

export function KpiRow() {
  const { data: kpis, isLoading } = useDashboard((d) => d.kpis);

  return (
    <ErrorBoundary>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Ventas"
          value={kpis?.sales}
          previousValue={kpis?.previous.sales}
          isCurrency
          isLoading={isLoading}
        />
        <KpiCard
          label="Tickets"
          value={kpis?.tickets}
          previousValue={kpis?.previous.tickets}
          isLoading={isLoading}
        />
        <KpiCard
          label="Ticket medio"
          value={kpis?.avgTicket}
          previousValue={kpis?.previous.avgTicket}
          isCurrency
          isLoading={isLoading}
        />
        <KpiCard
          label="Unidades"
          value={kpis?.units}
          previousValue={kpis?.previous.units}
          isLoading={isLoading}
        />
      </div>
    </ErrorBoundary>
  );
}
