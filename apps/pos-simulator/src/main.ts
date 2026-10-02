import pino from "pino";
import { STORES } from "./seed/stores.js";
import { generateDayForStore } from "./generator.js";

/**
 * Modo continuo: genera ventas del día actual cada N minutos y
 * las envía al ERP mock. Simula un POS en producción.
 */

const logger = pino({ transport: { target: "pino-pretty" } });
const ERP_MOCK_URL = process.env.ERP_MOCK_URL ?? "http://localhost:4010";
const INTERVAL_MS = Number(process.env.SIMULATOR_INTERVAL_MS ?? 300_000); // 5 min

async function tick() {
  const now = new Date();
  logger.info("Generando ventas de la hora actual...");

  for (const store of STORES) {
    // Generar solo unas pocas transacciones recientes
    const all = generateDayForStore(store, now);
    const currentHour = now.getHours();
    const recent = all.filter((t) => {
      const h = new Date(t.TransDate).getHours();
      return h === currentHour;
    });

    if (recent.length === 0) continue;

    try {
      await fetch(`${ERP_MOCK_URL}/data/RetailTransactions/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: recent }),
      });
      logger.info({ store: store.storeId, count: recent.length }, "Lote enviado");
    } catch (err) {
      logger.error({ err, store: store.storeId }, "Error al enviar");
    }
  }
}

logger.info({ intervalMs: INTERVAL_MS }, "Simulador POS iniciado");
tick();
setInterval(tick, INTERVAL_MS);
