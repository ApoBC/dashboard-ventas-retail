import type { Redis } from "ioredis";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });

/**
 * Caché stale-while-revalidate (SWR) con lock de recálculo.
 *
 * Corrección del hallazgo 7: el TTL fijo del plan provoca estampida
 * al expirar. Aquí:
 *
 * - Durante FRESH_MS se sirve directo.
 * - Entre FRESH_MS y STALE_MS se sirve caducado MIENTRAS UN SOLO
 *   proceso recalcula (lock con NX).
 * - El TTL incluye jitter para evitar expiración sincronizada.
 * - dataVersion (incrementada por la ingesta) invalida instantáneamente.
 */

const FRESH_MS = Number(process.env.CACHE_FRESH_MS ?? 60_000);
const STALE_MS = Number(process.env.CACHE_STALE_MS ?? 600_000);

type CacheEntry<T> = {
  at: number;
  version: number;
  value: T;
};

export function createSWRCache(redis: Redis) {
  async function getDataVersion(): Promise<number> {
    const v = await redis.get("data_version");
    return v ? Number(v) : 0;
  }

  async function cached<T>(
    key: string,
    compute: () => Promise<T>,
  ): Promise<{ value: T; cached: boolean }> {
    const currentVersion = await getDataVersion();
    const raw = await redis.get(key);

    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry<T>;
      const age = Date.now() - entry.at;
      const versionMatch = entry.version === currentVersion;

      // Fresco y de la versión correcta: servir directo
      if (age < FRESH_MS && versionMatch) {
        return { value: entry.value, cached: true };
      }

      // Caducado pero utilizable: servir mientras se recalcula
      if (age < STALE_MS && versionMatch) {
        const lockKey = `${key}:lock`;
        const acquired = await redis.set(lockKey, "1", "PX", 30_000, "NX");
        if (acquired) {
          // Este proceso recalcula; los demás siguen sirviendo el dato caducado
          refresh(key, compute, currentVersion).catch((err) =>
            logger.error({ err, key }, "Error al refrescar caché"),
          );
        }
        return { value: entry.value, cached: true };
      }
    }

    // Miss total o versión desactualizada: calcular y esperar
    const value = await refresh(key, compute, currentVersion);
    return { value, cached: false };
  }

  async function refresh<T>(
    key: string,
    compute: () => Promise<T>,
    version: number,
  ): Promise<T> {
    const value = await compute();
    const jitter = Math.floor(Math.random() * 30_000);
    const entry: CacheEntry<T> = { at: Date.now(), version, value };

    await redis.set(key, JSON.stringify(entry), "PX", STALE_MS + jitter);
    return value;
  }

  /** Genera la clave de caché determinista para un widget del dashboard */
  function dashboardKey(
    widget: string,
    from: string,
    to: string,
    granularity: string,
    storeIds: string[],
  ): string {
    return [
      "dash",
      "v1",
      widget,
      from,
      to,
      granularity,
      storeIds.slice().sort().join(","),
    ].join(":");
  }

  return { cached, dashboardKey, getDataVersion };
}
