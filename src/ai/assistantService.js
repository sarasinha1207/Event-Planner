import { answerLocally } from '../planner/assistant.js';
import { selectIdeas } from '../planner/ideas.js';
import { getEventType } from '../planner/eventTypes.js';
import {
  ASK_SYSTEM_PROMPT,
  IDEAS_SYSTEM_PROMPT,
  buildAskPrompt,
  buildIdeasPrompt,
  cleanAnswer,
  parseIdeasResponse,
} from './prompts.js';
import { createTtlCache } from './cache.js';

const IDEAS_MAX_TOKENS = 1200;
const ASK_MAX_TOKENS = 500;
const CACHE_MAX_ENTRIES = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

// Combines the AI client with the built-in planner. Every method returns a
// usable result: when the model is unavailable or answers badly, the built-in
// planner answers instead and the `source` field says which one did.
export function createAssistantService({ aiClient, logger, now = Date.now }) {
  const ideasCache = createTtlCache({ maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS, now });

  async function tryAi(request) {
    if (!aiClient.enabled) return null;
    try {
      return await aiClient.complete(request);
    } catch (error) {
      logger.warn('ai_request_failed', { reason: error.message });
      return null;
    }
  }

  async function generateIdeas(plan) {
    const cacheKey = JSON.stringify(plan.input);
    const cached = ideasCache.get(cacheKey);
    if (cached) return cached;

    const text = await tryAi({
      system: IDEAS_SYSTEM_PROMPT,
      prompt: buildIdeasPrompt(plan),
      maxTokens: IDEAS_MAX_TOKENS,
    });
    const aiIdeas = text ? parseIdeasResponse(text) : [];

    if (aiIdeas.length > 0) {
      const result = { source: 'ai', items: aiIdeas };
      ideasCache.set(cacheKey, result);
      return result;
    }
    const definition = getEventType(plan.input.eventType);
    return { source: 'builtin', items: selectIdeas(definition, plan.input) };
  }

  async function answerQuestion(plan, question, today) {
    const text = await tryAi({
      system: ASK_SYSTEM_PROMPT,
      prompt: buildAskPrompt(plan, question),
      maxTokens: ASK_MAX_TOKENS,
    });
    if (text) return { source: 'ai', answer: cleanAnswer(text) };
    return { source: 'builtin', answer: answerLocally(question, plan, today) };
  }

  return { enabled: aiClient.enabled, generateIdeas, answerQuestion };
}
