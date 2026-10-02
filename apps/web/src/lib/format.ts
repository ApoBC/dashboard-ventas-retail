/** Re-exporta las utilidades de formato de @retail/shared para uso en el front.
 *  Punto único: si se cambia el locale o la moneda, se cambia en shared. */
export {
  formatCurrency,
  formatCompactCurrency,
  formatNumber,
  formatPercent,
  pctChange,
} from "@retail/shared";
