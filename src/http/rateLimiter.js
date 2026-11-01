const PURGE_THRESHOLD = 5000;

// Fixed-window request counter keyed by client address.
export function createRateLimiter({ windowMs, max, now = Date.now }) {
  const windows = new Map();

  function purgeExpired(current) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= current) windows.delete(key);
    }
  }

  function check(key) {
    const current = now();
    if (windows.size > PURGE_THRESHOLD) purgeExpired(current);

    let entry = windows.get(key);
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;

    return {
      allowed: entry.count <= max,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - current) / 1000)),
    };
  }

  return { check, get size() { return windows.size; } };
}
