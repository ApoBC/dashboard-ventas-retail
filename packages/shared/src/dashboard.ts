/** Tipos del contrato de datos del dashboard. El front nunca recibe filas crudas:
 *  cada endpoint devuelve exactamente lo que el gráfico pinta, ya agregado y ya
 *  convertido a la zona horaria de la tienda. */

export type KpiBlock = {
  sales: number;
  tickets: number;
  avgTicket: number;
  units: number;
};

export type Kpis = KpiBlock & { previous: KpiBlock };

export type SalesByBucket = {
  bucket: string;
  sales: number;
  tickets: number;
}[];

export type SalesByStore = {
  storeId: string;
  storeName: string;
  sales: number;
}[];

export type TopProduct = {
  sku: string;
  name: string;
  units: number;
  sales: number;
};

export type PaymentMix = {
  method: string;
  sales: number;
  share: number;
}[];

export type DashboardMeta = {
  granularity: "hour" | "day";
  timezone: string;
  generatedAt: string;
  cached: boolean;
  dataVersion: number;
};

export type DashboardSummary = {
  kpis: Kpis;
  byBucket: SalesByBucket;
  byStore: SalesByStore;
  topProducts: TopProduct[];
  paymentMix: PaymentMix;
  meta: DashboardMeta;
};

/** Respuesta genérica de la API */
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
};
