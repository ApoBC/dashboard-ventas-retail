import { FilterBar } from "@/features/filters/FilterBar";
import { KpiRow } from "@/features/kpis/KpiRow";
import { SalesByHour } from "@/features/charts/SalesByHour";
import { PaymentDonut } from "@/features/charts/PaymentDonut";
import { SalesByStore } from "@/features/charts/SalesByStore";
import { TopProducts } from "@/features/charts/TopProducts";

/**
 * Página principal del dashboard.
 *
 * Layout basado en el documento de diseño (sección 3):
 * - Arriba: KPIs (el "cuánto")
 * - Medio: ventas por hora (el "cuándo") + medios de pago
 * - Abajo: ventas por tienda (el "dónde") + top productos (el "qué")
 */
export function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <FilterBar />

      {/* KPIs — 4 columnas en desktop, 2×2 en móvil */}
      <KpiRow />

      {/* Fila 2: ventas por hora (2/3) + donut de pagos (1/3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <div className="md:col-span-2">
          <SalesByHour />
        </div>
        <div>
          <PaymentDonut />
        </div>
      </div>

      {/* Fila 3: tiendas (5/12) + top productos (7/12) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-3">
        <div className="md:col-span-5">
          <SalesByStore />
        </div>
        <div className="md:col-span-7">
          <TopProducts />
        </div>
      </div>

      {/* Pie: indicador de caché y versión de datos */}
      <CacheIndicator />
    </div>
  );
}

function CacheIndicator() {
  return (
    <p className="text-center text-[11px] text-gray-400 mt-6 mb-4">
      Los datos se actualizan cada minuto · Dashboard v0.1.0
    </p>
  );
}
