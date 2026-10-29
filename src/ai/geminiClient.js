// Client for the Gemini API with automatic model failover.
//
// Models are tried in the configured order. A model that is out of quota,
// overloaded, retired, slow or that returns nothing is set aside for a short
// while and the next model is used, so the assistant keeps working as long as
// any one model can answer. Only a rejected API key stops the whole chain.

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Models that "think" before they answer spend part of the output allowance on it,
// which can cut a short answer off. The setting that turns it down depends on the family.
const THINKING_BUDGET_MODELS = /^gemini-2\.5-flash/;
const THINKING_LEVEL_MODELS = /^gemini-3/;
const TOTAL_BUDGET_FACTOR = 2;
const TEMPERATURE = 0.7;
const MAX_RETRY_AFTER_MS = 3_600_000;
// Statuses that can mean the key itself is the problem, as opposed to one model.
const KEY_ERROR_STATUSES = Object.freeze([400, 401, 403]);

export const COOLDOWNS_MS = Object.freeze({
  quota: 60_000,
  busy: 30_000,
  retired: MAX_RETRY_AFTER_MS,
  other: 120_000,
  transient: 15_000,
});

export class AiUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'AiUnavailableError';
  }
}

// Raised for a failure that only affects one model: the next one may succeed.
class ModelSkipped extends Error {
  constructor(reason, cooldownMs) {
    super(reason);
    this.cooldownMs = cooldownMs;
  }
}

/**
 * Remembers which models are temporarily set aside.
 *
 * @param {{ models: string[], now?: () => number }} options
 * @returns {{ order: Function, block: Function, clear: Function, isBlocked: Function }}
 */
export function createModelPool({ models, now = Date.now }) {
  const blockedUntil = new Map();
  return {
    // Preferred order, skipping models that are cooling down. If every model is
    // cooling down, try them all anyway, soonest to recover first.
    order() {
      const current = now();
      const ready = models.filter((model) => (blockedUntil.get(model) ?? 0) <= current);
      if (ready.length > 0) return ready;
      return [...models].sort((a, b) => blockedUntil.get(a) - blockedUntil.get(b));
    },
    block: (model, ms) => blockedUntil.set(model, now() + ms),
    clear: (model) => blockedUntil.delete(model),
    isBlocked: (model) => (blockedUntil.get(model) ?? 0) > now(),
  };
}

/**
 * Gemini needs turns that alternate and start with the user.
 *
 * @param {{ role: string, text: string }[]} turns
 * @returns {{ role: string, text: string }[]}
 */
export function normaliseTurns(turns) {
  const merged = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.text += `\n${turn.text}`;
    else if (last || turn.role === 'user') merged.push({ ...turn });
  }
  return merged;
}

// How to keep a model's thinking small, or null for models where it is not set
// (such as the "-latest" aliases, whose underlying model can change).
function thinkingConfigFor(model) {
  if (THINKING_BUDGET_MODELS.test(model)) return { thinkingBudget: 0 };
  if (THINKING_LEVEL_MODELS.test(model)) return { thinkingLevel: 'minimal' };
  return null;
}

function cooldownFor(status, response) {
  if (status === 429) {
    const seconds = Number(response.headers?.get?.('retry-after'));
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : COOLDOWNS_MS.quota;
  }
  if (status === 404) return COOLDOWNS_MS.retired;
  if (status >= 500) return COOLDOWNS_MS.busy;
  return COOLDOWNS_MS.other;
}

async function readErrorMessage(response) {
  try {
    return String((await response.json())?.error?.message ?? '');
  } catch {
    return '';
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => typeof part?.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

/**
 * The key is held in this closure and sent in a header, never in the URL, so it
 * does not appear in logs or error messages.
 *
 * @param {{ apiKey: string, models: string[], timeoutMs: number, fetchImpl?: Function, now?: () => number, logger?: object }} options
 * @returns {{ enabled: boolean, complete: Function, pool: object }} `complete` resolves to `{ text, model }`.
 */
export function createGeminiClient({ apiKey, models, timeoutMs, fetchImpl = fetch, now = Date.now, logger }) {
  const enabled = typeof apiKey === 'string' && apiKey.length > 0 && models.length > 0;
  const pool = createModelPool({ models, now });

  // Sends one request to one model. Network failures become ModelSkipped.
  async function sendRequest(model, { system, turns, maxTokens }) {
    const generationConfig = { maxOutputTokens: maxTokens, temperature: TEMPERATURE };
    const thinkingConfig = thinkingConfigFor(model);
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

    try {
      return await fetchImpl(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
          generationConfig,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ModelSkipped('network', COOLDOWNS_MS.transient);
    }
  }

  // Turns a failed response into the right error: a rejected key stops the
  // whole chain, anything else only sets this model aside.
  async function failureFor(response) {
    const detail = await readErrorMessage(response);
    if (KEY_ERROR_STATUSES.includes(response.status) && /api key/i.test(detail)) {
      return new AiUnavailableError('The Gemini API key was rejected.');
    }
    return new ModelSkipped(`status ${response.status}`, cooldownFor(response.status, response));
  }

  async function callModel(model, request) {
    const response = await sendRequest(model, request);
    if (!response.ok) throw await failureFor(response);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ModelSkipped('unreadable response', COOLDOWNS_MS.other);
    }
    const text = extractText(payload);
    if (!text) throw new ModelSkipped('empty response', COOLDOWNS_MS.transient);
    return text;
  }

  // Returns { text, model }. `history` is earlier turns as { role, text }.
  async function complete({ system, prompt, history = [], maxTokens }) {
    if (!enabled) throw new AiUnavailableError('AI service is not configured.');

    const turns = normaliseTurns([...history, { role: 'user', text: prompt }]);
    const startedAt = now();
    for (const model of pool.order()) {
      if (now() - startedAt > timeoutMs * TOTAL_BUDGET_FACTOR) break;
      try {
        const text = await callModel(model, { system, turns, maxTokens });
        pool.clear(model);
        return { text, model };
      } catch (error) {
        if (!(error instanceof ModelSkipped)) throw error;
        pool.block(model, error.cooldownMs);
        logger?.warn('ai_model_skipped', { model, reason: error.message });
      }
    }
    throw new AiUnavailableError('No Gemini model is available right now.');
  }

  return { enabled, complete, pool };
}
