import { faker } from "@faker-js/faker";
import type { RetailTransaction, RetailTransactionLine } from "@retail/shared";
import { PRODUCTS, PAYMENT_METHODS, type ProductSeed } from "./seed/products.js";
import { CASHIERS, type StoreConfig } from "./seed/stores.js";

/**
 * Distribución de ventas por hora (0–23). Simula las horas punta reales
 * de un retail: pico a mediodía y otro al final de la tarde.
 * Los valores son pesos relativos, no porcentajes.
 */
const HOURLY_DISTRIBUTION = [
  0, 0, 0, 0, 0, 0,    // 00–05: cerrado
  0, 2, 5, 8, 10, 12,  // 06–11: apertura → pico mediodía
  11, 9, 8, 10, 12, 11, // 12–17: bajón post-almuerzo → pico tarde
  9, 6, 3, 1, 0, 0,    // 18–23: cierre
];

const HOURLY_TOTAL = HOURLY_DISTRIBUTION.reduce((a, b) => a + b, 0);

/** Tabla acumulativa para weighted random */
function buildCdf(items: { weight: number }[]): number[] {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let acc = 0;
  return items.map((i) => (acc += i.weight / total));
}

function pickWeighted<T extends { weight: number }>(items: T[], cdf: number[]): T {
  const r = Math.random();
  for (let i = 0; i < cdf.length; i++) {
    if (r <= cdf[i]) return items[i];
  }
  return items[items.length - 1];
}

const productCdf = buildCdf(PRODUCTS);
const paymentCdf = buildCdf(PAYMENT_METHODS);

function pickProducts(): { product: ProductSeed; qty: number }[] {
  const count = faker.number.int({ min: 1, max: 8 });
  const picked = new Set<string>();
  const result: { product: ProductSeed; qty: number }[] = [];

  for (let i = 0; i < count; i++) {
    const p = pickWeighted(PRODUCTS, productCdf);
    if (picked.has(p.sku)) continue;
    picked.add(p.sku);
    result.push({
      product: p,
      qty: p.category === "Panadería"
        ? faker.number.int({ min: 2, max: 10 })
        : faker.number.int({ min: 1, max: 3 }),
    });
  }
  return result;
}

let txCounter = 0;

/**
 * Genera transacciones para un día completo en una tienda.
 * La cantidad se distribuye según la curva horaria.
 */
export function generateDayForStore(
  store: StoreConfig,
  date: Date,
): RetailTransaction[] {
  const storeCashiers = CASHIERS.filter((c) => c.storeId === store.storeId);
  const transactions: RetailTransaction[] = [];

  // Variación diaria: +/- 20 %, fines de semana +30 %
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dayMultiplier = isWeekend
    ? 1.3 + (Math.random() * 0.2 - 0.1)
    : 1.0 + (Math.random() * 0.4 - 0.2);

  const dailyTarget = Math.round(store.avgDailyTransactions * dayMultiplier);

  for (let hour = 0; hour < 24; hour++) {
    const hourWeight = HOURLY_DISTRIBUTION[hour] / HOURLY_TOTAL;
    const hourCount = Math.round(dailyTarget * hourWeight);

    for (let i = 0; i < hourCount; i++) {
      txCounter++;
      const minute = faker.number.int({ min: 0, max: 59 });
      const second = faker.number.int({ min: 0, max: 59 });

      const transDate = new Date(date);
      transDate.setHours(hour, minute, second, 0);

      const terminalNum = faker.number.int({ min: 1, max: store.terminals });
      const cashier = faker.helpers.arrayElement(storeCashiers);
      const payment = pickWeighted(PAYMENT_METHODS, paymentCdf);

      const items = pickProducts();
      const lines: RetailTransactionLine[] = items.map((item, idx) => ({
        LineNum: idx + 1,
        Sku: item.product.sku,
        ProductName: item.product.name,
        Quantity: item.qty,
        UnitPrice: item.product.unitPrice,
        LineTotal: Math.round(item.product.unitPrice * item.qty * 100) / 100,
      }));

      const total = lines.reduce((sum, l) => sum + l.LineTotal, 0);

      // ~1 % de transacciones son anulaciones (para probar el filtro is_void)
      const isVoid = Math.random() < 0.01;

      const txId = `TX-${store.storeId}-${String(txCounter).padStart(8, "0")}`;

      transactions.push({
        TransactionId: txId,
        StoreId: store.storeId,
        TerminalId: `T${terminalNum}`,
        CashierId: cashier.cashierId,
        TransDate: transDate.toISOString(),
        TotalNeto: Math.round(total * 100) / 100,
        PaymentMethod: payment.method,
        IsVoid: isVoid,
        ModifiedDateTime: transDate.toISOString(),
        Lines: lines,
      });
    }
  }

  return transactions;
}

/**
 * Genera un lote de devoluciones (5 % de las transacciones originales).
 * Las devoluciones son transacciones con cantidades negativas.
 */
export function generateReturns(
  originals: RetailTransaction[],
  returnRate = 0.05,
): RetailTransaction[] {
  const returns: RetailTransaction[] = [];
  const count = Math.round(originals.length * returnRate);

  for (let i = 0; i < count; i++) {
    const orig = faker.helpers.arrayElement(originals);
    if (orig.IsVoid) continue;

    txCounter++;
    const returnDate = new Date(
      new Date(orig.TransDate).getTime() + faker.number.int({ min: 60_000, max: 7_200_000 }),
    );

    const returnLine = faker.helpers.arrayElement(orig.Lines);
    const returnQty = faker.number.int({ min: 1, max: returnLine.Quantity });

    returns.push({
      TransactionId: `RET-${orig.StoreId}-${String(txCounter).padStart(8, "0")}`,
      StoreId: orig.StoreId,
      TerminalId: orig.TerminalId,
      CashierId: orig.CashierId,
      TransDate: returnDate.toISOString(),
      TotalNeto: -(returnLine.UnitPrice * returnQty),
      PaymentMethod: orig.PaymentMethod,
      IsVoid: false,
      ModifiedDateTime: returnDate.toISOString(),
      Lines: [
        {
          LineNum: 1,
          Sku: returnLine.Sku,
          ProductName: returnLine.ProductName,
          Quantity: -returnQty,
          UnitPrice: returnLine.UnitPrice,
          LineTotal: -(returnLine.UnitPrice * returnQty),
        },
      ],
    });
  }

  return returns;
}
