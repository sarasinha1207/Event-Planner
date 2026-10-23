import { HttpError } from '../http/errors.js';
import { diffDays, parseIsoDate, todayIso } from '../planner/dates.js';
import { describeCurrencies, describeEventTypes, MAX_PRIORITIES } from '../planner/eventTypes.js';
import { planFromRequest } from '../planner/plan.js';
import { LIMITS, cleanText } from '../planner/validate.js';
import { MAX_QUESTION_LENGTH } from '../ai/prompts.js';

// The client sends its own calendar date so "today" matches the user's time
// zone. It is only trusted when it is within one day of the server's date.
export function resolveToday(candidate, nowMs) {
  const serverToday = todayIso(new Date(nowMs));
  const usable =
    typeof candidate === 'string' && parseIsoDate(candidate) && Math.abs(diffDays(serverToday, candidate)) <= 1;
  return usable ? candidate : serverToday;
}

function requirePlan(body, nowMs) {
  const today = resolveToday(body?.today, nowMs);
  const result = planFromRequest(body?.event, today);
  if (!result.ok) {
    throw new HttpError(400, 'Some event details need attention.', { details: { errors: result.errors } });
  }
  return { plan: result.plan, today };
}

function requireQuestion(body) {
  const question = cleanText(body?.question);
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    throw new HttpError(400, `Enter a question of up to ${MAX_QUESTION_LENGTH} characters.`, {
      details: { errors: [{ field: 'question', message: `Enter a question of up to ${MAX_QUESTION_LENGTH} characters.` }] },
    });
  }
  return question;
}

// Each route is { method, path, limit, handler }. Handlers receive the parsed
// body and return a JSON-serialisable result.
export function createApiRoutes({ assistant, now = Date.now }) {
  return [
    {
      method: 'GET',
      path: '/api/health',
      limit: 'general',
      handler: () => ({ status: 'ok' }),
    },
    {
      method: 'GET',
      path: '/api/meta',
      limit: 'general',
      handler: () => ({
        eventTypes: describeEventTypes(),
        currencies: describeCurrencies(),
        maxPriorities: MAX_PRIORITIES,
        limits: {
          nameMax: LIMITS.nameMax,
          locationMax: LIMITS.locationMax,
          themeMax: LIMITS.themeMax,
          interestsMax: LIMITS.interestsMax,
          guestsMax: LIMITS.guestsMax,
          budgetMin: LIMITS.budgetMin,
          questionMax: MAX_QUESTION_LENGTH,
        },
        aiEnabled: assistant.enabled,
      }),
    },
    {
      method: 'POST',
      path: '/api/plan',
      limit: 'general',
      handler: ({ body }) => ({ plan: requirePlan(body, now()).plan }),
    },
    {
      method: 'POST',
      path: '/api/ideas',
      limit: 'ai',
      handler: async ({ body }) => {
        const { plan } = requirePlan(body, now());
        return { ideas: await assistant.generateIdeas(plan) };
      },
    },
    {
      method: 'POST',
      path: '/api/ask',
      limit: 'ai',
      handler: async ({ body }) => {
        const { plan, today } = requirePlan(body, now());
        const question = requireQuestion(body);
        return assistant.answerQuestion(plan, question, today);
      },
    },
  ];
}
