import type { RetailTransaction } from "@retail/shared";

/**
 * Almacén en memoria de transacciones POS. El pos-simulator las inyecta
 * vía POST /data/RetailTransactions/batch. Este store las indexa por
 * (ModifiedDateTime, TransactionId) para soportar el cursor compuesto.
 */

const transactions: RetailTransaction[] = [];

export function addTransactions(batch: RetailTransaction[]): number {
  transactions.push(...batch);
  // Mantener orden por cursor compuesto
  transactions.sort((a, b) => {
    const dateCmp =
      new Date(a.ModifiedDateTime).getTime() -
      new Date(b.ModifiedDateTime).getTime();
    if (dateCmp !== 0) return dateCmp;
    return a.TransactionId.localeCompare(b.TransactionId);
  });
  return batch.length;
}

export function getTransactions(opts: {
  afterModified: Date | null;
  afterId: string;
  top: number;
  includeLines: boolean;
}): { items: RetailTransaction[]; totalCount: number } {
  let filtered = transactions;

  if (opts.afterModified) {
    const afterMs = opts.afterModified.getTime();
    filtered = filtered.filter((t) => {
      const tMs = new Date(t.ModifiedDateTime).getTime();
      if (tMs > afterMs) return true;
      if (tMs === afterMs && t.TransactionId > opts.afterId) return true;
      return false;
    });
  }

  const items = filtered.slice(0, opts.top).map((t) => ({
    ...t,
    Lines: opts.includeLines ? t.Lines : [],
  }));

  return { items, totalCount: filtered.length };
}

export function getCount(): number {
  return transactions.length;
}
