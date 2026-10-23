function readInteger(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

// Reads settings from environment variables. Nothing is required: without an
// API key the application runs entirely on the built-in planner.
export function loadConfig(env = process.env) {
  return Object.freeze({
    port: readInteger(env, 'PORT', 3000, 0, 65535),
    host: env.HOST || '127.0.0.1',
    anthropicApiKey: (env.ANTHROPIC_API_KEY ?? '').trim(),
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    aiTimeoutMs: readInteger(env, 'AI_TIMEOUT_MS', 20_000, 1000, 120_000),
    rateLimitWindowMs: readInteger(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1000, 3_600_000),
    rateLimitMax: readInteger(env, 'RATE_LIMIT_MAX', 120, 1, 100_000),
    aiRateLimitMax: readInteger(env, 'AI_RATE_LIMIT_MAX', 10, 1, 10_000),
    maxBodyBytes: readInteger(env, 'MAX_BODY_BYTES', 16 * 1024, 1024, 1024 * 1024),
  });
}
