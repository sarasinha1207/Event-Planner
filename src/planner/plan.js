import { diffDays } from './dates.js';
import { getEventType } from './eventTypes.js';
import { buildBudget } from './budget.js';
import { buildTimeline, createDateScaler, timelineSpan } from './timeline.js';
import { buildVendors } from './vendors.js';
import { budgetTier, selectIdeas } from './ideas.js';
import { validateEventInput } from './validate.js';

/**
 * Builds a complete plan from an already validated event description.
 *
 * @param {object} input A validated event description.
 * @param {string} today ISO date.
 * @returns {object} The plan.
 */
export function buildPlan(input, today) {
  const definition = getEventType(input.eventType);
  const scaler = createDateScaler({
    eventDate: input.eventDate,
    today,
    spanDays: timelineSpan(definition),
  });

  const budget = buildBudget(definition, input);
  const timeline = buildTimeline(definition, scaler);
  const vendors = buildVendors(definition, budget, scaler);
  const ideas = selectIdeas(definition, input);
  const daysUntilEvent = diffDays(today, input.eventDate);

  return {
    input,
    eventTypeLabel: definition.label,
    generatedOn: today,
    summary: {
      daysUntilEvent,
      weeksUntilEvent: Math.floor(daysUntilEvent / 7),
      budgetPerGuest: Math.round(input.totalBudget / input.guestCount),
      budgetTier: budgetTier(definition, input),
      taskCount: timeline.tasks.length,
      vendorCount: vendors.length,
      compressed: timeline.compressed,
      recommendedWeeks: timeline.recommendedWeeks,
    },
    budget,
    timeline,
    vendors,
    ideas: { source: 'builtin', items: ideas },
  };
}

/**
 * Validates a raw request and, when it is acceptable, builds the plan.
 *
 * @param {unknown} raw The event as received.
 * @param {string} today ISO date.
 * @returns {{ ok: true, plan: object } | { ok: false, errors: { field: string, message: string }[] }}
 */
export function planFromRequest(raw, today) {
  const result = validateEventInput(raw, { today });
  if (!result.ok) return result;
  return { ok: true, plan: buildPlan(result.value, today) };
}
