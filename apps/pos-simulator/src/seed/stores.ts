export type StoreConfig = {
  storeId: string;
  name: string;
  city: string;
  timezone: string;
  terminals: number;
  avgDailyTransactions: number;
};

export const STORES: StoreConfig[] = [
  {
    storeId: "LIM-01",
    name: "Lima Centro",
    city: "Lima",
    timezone: "America/Lima",
    terminals: 4,
    avgDailyTransactions: 280,
  },
  {
    storeId: "LIM-02",
    name: "Lima Norte",
    city: "Lima",
    timezone: "America/Lima",
    terminals: 3,
    avgDailyTransactions: 220,
  },
  {
    storeId: "AQP-01",
    name: "Arequipa Plaza",
    city: "Arequipa",
    timezone: "America/Lima",
    terminals: 2,
    avgDailyTransactions: 160,
  },
  {
    storeId: "TRU-01",
    name: "Trujillo Mall",
    city: "Trujillo",
    timezone: "America/Lima",
    terminals: 2,
    avgDailyTransactions: 120,
  },
  {
    storeId: "CUZ-01",
    name: "Cusco Centro",
    city: "Cusco",
    timezone: "America/Lima",
    terminals: 2,
    avgDailyTransactions: 90,
  },
];

export const CASHIERS = [
  { cashierId: "C-001", name: "Ana García", storeId: "LIM-01" },
  { cashierId: "C-002", name: "Luis Torres", storeId: "LIM-01" },
  { cashierId: "C-003", name: "María López", storeId: "LIM-01" },
  { cashierId: "C-004", name: "Carlos Ruiz", storeId: "LIM-01" },
  { cashierId: "C-005", name: "Rosa Mendoza", storeId: "LIM-02" },
  { cashierId: "C-006", name: "Pedro Vargas", storeId: "LIM-02" },
  { cashierId: "C-007", name: "Lucía Flores", storeId: "LIM-02" },
  { cashierId: "C-008", name: "Diego Ramos", storeId: "AQP-01" },
  { cashierId: "C-009", name: "Carmen Soto", storeId: "AQP-01" },
  { cashierId: "C-010", name: "José Huamán", storeId: "TRU-01" },
  { cashierId: "C-011", name: "Elena Quispe", storeId: "TRU-01" },
  { cashierId: "C-012", name: "Miguel Condori", storeId: "CUZ-01" },
  { cashierId: "C-013", name: "Patricia Mamani", storeId: "CUZ-01" },
];
