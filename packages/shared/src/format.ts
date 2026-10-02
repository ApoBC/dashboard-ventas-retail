/** Formateo centralizado de moneda, número y fecha. Se define una sola vez
 *  y todos los servicios y el front lo usan. Así no hay discrepancias entre
 *  cómo muestra un KPI el front y cómo lo formatea el CSV del backend. */

const LOCALE = "es-PE";
const CURRENCY = "PEN";

const currencyFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFmt = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFmt = new Intl.NumberFormat(LOCALE);

const percentFmt = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function formatCurrency(value: number): string {
  return currencyFmt.format(value);
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFmt.format(value);
}

export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

export function formatPercent(value: number): string {
  return percentFmt.format(value);
}

/** Variación porcentual con protección contra división por cero */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
