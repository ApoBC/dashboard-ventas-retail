import type { DashboardSummary, ApiResponse } from "@retail/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

function generateMockData(): DashboardSummary {
  const hours = Array.from({ length: 14 }, (_, i) => {
    const h = i + 8;
    const peak = h >= 11 && h <= 13 ? 1.8 : h >= 17 && h <= 19 ? 1.5 : 1;
    const base = 3200 + Math.random() * 1800;
    return {
      bucket: `2026-09-28T${String(h).padStart(2, "0")}:00:00-05:00`,
      sales: Math.round(base * peak),
      tickets: Math.round((12 + Math.random() * 8) * peak),
    };
  });

  const totalSales = hours.reduce((s, h) => s + h.sales, 0);
  const totalTickets = hours.reduce((s, h) => s + h.tickets, 0);
  const totalUnits = Math.round(totalTickets * 2.7);
  const prevFactor = 0.88 + Math.random() * 0.06;

  return {
    kpis: {
      sales: totalSales,
      tickets: totalTickets,
      avgTicket: Math.round(totalSales / totalTickets),
      units: totalUnits,
      previous: {
        sales: Math.round(totalSales * prevFactor),
        tickets: Math.round(totalTickets * prevFactor),
        avgTicket: Math.round((totalSales * prevFactor) / (totalTickets * prevFactor)),
        units: Math.round(totalUnits * prevFactor),
      },
    },
    byBucket: hours,
    byStore: [
      { storeId: "LIM-01", storeName: "Lima Centro", sales: Math.round(totalSales * 0.32) },
      { storeId: "LIM-02", storeName: "Lima Sur", sales: Math.round(totalSales * 0.24) },
      { storeId: "AQP-01", storeName: "Arequipa", sales: Math.round(totalSales * 0.19) },
      { storeId: "TRU-01", storeName: "Trujillo", sales: Math.round(totalSales * 0.14) },
      { storeId: "CUZ-01", storeName: "Cusco", sales: Math.round(totalSales * 0.11) },
    ],
    topProducts: [
      { sku: "BEB-001", name: "Agua mineral 600ml", units: 487, sales: 974 },
      { sku: "SNK-001", name: "Galleta chocolate", units: 412, sales: 1648 },
      { sku: "LIM-001", name: "Detergente 1kg", units: 298, sales: 5364 },
      { sku: "BEB-002", name: "Gaseosa 500ml", units: 276, sales: 828 },
      { sku: "HIG-001", name: "Papel higiénico x4", units: 234, sales: 3042 },
      { sku: "ALI-001", name: "Arroz 1kg", units: 198, sales: 990 },
      { sku: "SNK-002", name: "Papas fritas 150g", units: 187, sales: 935 },
      { sku: "BEB-003", name: "Jugo de naranja 1L", units: 165, sales: 825 },
      { sku: "HIG-002", name: "Jabón líquido 250ml", units: 143, sales: 858 },
      { sku: "ALI-002", name: "Aceite vegetal 1L", units: 121, sales: 1089 },
    ],
    paymentMix: [
      { method: "Tarjeta", sales: Math.round(totalSales * 0.52), share: 52 },
      { method: "Efectivo", sales: Math.round(totalSales * 0.31), share: 31 },
      { method: "Billetera", sales: Math.round(totalSales * 0.12), share: 12 },
      { method: "QR", sales: Math.round(totalSales * 0.05), share: 5 },
    ],
    meta: {
      granularity: "hour",
      timezone: "America/Lima",
      generatedAt: new Date().toISOString(),
      cached: false,
      dataVersion: 1,
    },
  };
}

const mockStores = [
  { store_id: "LIM-01", name: "Lima Centro", city: "Lima", timezone: "America/Lima" },
  { store_id: "LIM-02", name: "Lima Sur", city: "Lima", timezone: "America/Lima" },
  { store_id: "AQP-01", name: "Arequipa", city: "Arequipa", timezone: "America/Lima" },
  { store_id: "TRU-01", name: "Trujillo", city: "Trujillo", timezone: "America/Lima" },
  { store_id: "CUZ-01", name: "Cusco", city: "Cusco", timezone: "America/Lima" },
];

export async function fetchDashboardSummary(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    return generateMockData();
  }

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/dashboard/summary?${qs}`, { signal });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Error ${res.status}`);
  }

  const json = (await res.json()) as ApiResponse<DashboardSummary>;
  if (!json.success || !json.data) {
    throw new Error(json.error ?? "Respuesta inesperada");
  }

  return json.data;
}

export type Store = {
  store_id: string;
  name: string;
  city: string;
  timezone: string;
};

export async function fetchStores(): Promise<Store[]> {
  if (USE_MOCK) return mockStores;

  const res = await fetch(`${API_BASE}/stores`);
  const json = (await res.json()) as ApiResponse<Store[]>;
  return json.data ?? [];
}
