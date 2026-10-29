/**
 * Small in-memory cache with a time limit and a size cap. Used to avoid paying
 * for the same AI request twice.
 *
 * @param {{ maxEntries: number, ttlMs: number, now?: () => number }} options
 * @returns {{ get: Function, set: Function, size: number }}
 */
export function createTtlCache({ maxEntries, ttlMs, now = Date.now }) {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      if (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }
    },
    get size() {
      return entries.size;
    },
  };
}
