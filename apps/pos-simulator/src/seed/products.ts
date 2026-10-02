export type ProductSeed = {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  /** Peso relativo de aparición: 10 = producto estrella, 1 = poco vendido */
  weight: number;
};

export const PRODUCTS: ProductSeed[] = [
  // Bebidas — las más vendidas
  { sku: "BEB-001", name: "Gaseosa 500 ml", category: "Bebidas", unitPrice: 2.5, weight: 10 },
  { sku: "BEB-002", name: "Agua mineral 625 ml", category: "Bebidas", unitPrice: 1.5, weight: 8 },
  { sku: "BEB-003", name: "Jugo de naranja 1 L", category: "Bebidas", unitPrice: 5.9, weight: 5 },
  { sku: "BEB-004", name: "Cerveza lata 355 ml", category: "Bebidas", unitPrice: 4.5, weight: 6 },

  // Panadería
  { sku: "PAN-001", name: "Pan francés", category: "Panadería", unitPrice: 0.2, weight: 9 },
  { sku: "PAN-002", name: "Pan integral", category: "Panadería", unitPrice: 0.4, weight: 4 },

  // Lácteos
  { sku: "LAC-001", name: "Leche 1 L", category: "Lácteos", unitPrice: 4.8, weight: 7 },
  { sku: "LAC-002", name: "Yogurt 1 L", category: "Lácteos", unitPrice: 6.5, weight: 5 },
  { sku: "LAC-003", name: "Queso fresco 500 g", category: "Lácteos", unitPrice: 12.0, weight: 3 },

  // Abarrotes
  { sku: "ABR-001", name: "Arroz 5 kg", category: "Abarrotes", unitPrice: 18.9, weight: 6 },
  { sku: "ABR-002", name: "Azúcar 1 kg", category: "Abarrotes", unitPrice: 4.2, weight: 5 },
  { sku: "ABR-003", name: "Aceite 1 L", category: "Abarrotes", unitPrice: 8.9, weight: 4 },
  { sku: "ABR-004", name: "Fideos 500 g", category: "Abarrotes", unitPrice: 3.5, weight: 5 },
  { sku: "ABR-005", name: "Atún en lata", category: "Abarrotes", unitPrice: 5.5, weight: 4 },

  // Limpieza
  { sku: "LIM-001", name: "Detergente 900 g", category: "Limpieza", unitPrice: 14.5, weight: 4 },
  { sku: "LIM-002", name: "Lejía 1 L", category: "Limpieza", unitPrice: 3.8, weight: 3 },
  { sku: "LIM-003", name: "Papel higiénico x4", category: "Limpieza", unitPrice: 8.9, weight: 5 },

  // Snacks
  { sku: "SNK-001", name: "Papas fritas 150 g", category: "Snacks", unitPrice: 4.5, weight: 6 },
  { sku: "SNK-002", name: "Galletas chocolate", category: "Snacks", unitPrice: 3.2, weight: 5 },
  { sku: "SNK-003", name: "Chocolate barra", category: "Snacks", unitPrice: 3.8, weight: 4 },

  // Frutas y verduras
  { sku: "FRU-001", name: "Plátano kg", category: "Frutas", unitPrice: 2.5, weight: 6 },
  { sku: "FRU-002", name: "Manzana kg", category: "Frutas", unitPrice: 5.5, weight: 4 },
  { sku: "FRU-003", name: "Papa kg", category: "Verduras", unitPrice: 3.0, weight: 5 },
  { sku: "FRU-004", name: "Cebolla kg", category: "Verduras", unitPrice: 2.8, weight: 4 },
  { sku: "FRU-005", name: "Tomate kg", category: "Verduras", unitPrice: 4.0, weight: 4 },
];

/** Métodos de pago con sus pesos relativos */
export const PAYMENT_METHODS = [
  { method: "Tarjeta", weight: 52 },
  { method: "Efectivo", weight: 31 },
  { method: "Billetera", weight: 12 },
  { method: "QR", weight: 5 },
];
