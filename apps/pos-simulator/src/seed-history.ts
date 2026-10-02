import pino from "pino";
import { STORES } from "./seed/stores.js";
import { generateDayForStore, generateReturns } from "./generator.js";

/**
 * Genera 30 días de historia y la envía al ERP mock.
 * Se ejecuta con: pnpm --filter pos-simulator seed
 */

const logger = pino({ transport: { target: "pino-pretty" } });
const ERP_MOCK_URL = process.env.ERP_MOCK_URL ?? "http://localhost:4010";
const DAYS_OF_HISTORY = 30;

async function main() {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 0);

  let totalTx = 0;

  for (let d = DAYS_OF_HISTORY; d >= 0; d--) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);

    for (const store of STORES) {
      const transactions = generateDayForStore(store, date);
      const returns = generateReturns(transactions);
      const batch = [...transactions, ...returns];

      const res = await fetch(`${ERP_MOCK_URL}/data/RetailTransactions/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: batch }),
      });

      if (!res.ok) {
        logger.error(
          { status: res.status, store: store.storeId, date: date.toISOString().slice(0, 10) },
          "Error al enviar lote",
        );
        continue;
      }

      totalTx += batch.length;
    }

    logger.info(
      { date: date.toISOString().slice(0, 10), totalTx },
      "Día generado",
    );
  }

  logger.info({ totalTx }, "Seed completado");
}

main().catch((err) => {
  logger.error(err, "Seed fallido");
  process.exit(1);
});
