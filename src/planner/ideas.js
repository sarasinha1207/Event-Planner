import { CURRENCIES } from './currencies.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'our', 'you', 'that', 'this', 'are', 'from', 'have', 'has', 'not', 'but',
  'all', 'can', 'will', 'want', 'like', 'love', 'lots', 'some', 'very', 'also', 'would', 'into', 'about',
]);

const DEFAULT_IDEA_COUNT = 8;

/**
 * Classifies the spend per guest as essential, balanced or premium for this event type.
 *
 * @param {object} definition
 * @param {object} input A validated event description.
 * @returns {'essential' | 'balanced' | 'premium'}
 */
export function budgetTier(definition, input) {
  const perGuestUsd = (input.totalBudget / input.guestCount) * CURRENCIES[input.currency].usdRate;
  const [essentialBelow, balancedBelow] = definition.tierThresholdsUsd;
  if (perGuestUsd < essentialBelow) return 'essential';
  return perGuestUsd < balancedBelow ? 'balanced' : 'premium';
}

// Light normalisation so "flowers" matches the tag "flower".
function normalise(word) {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * Lower-cased words of at least three letters, without common filler words.
 *
 * @param {unknown} text
 * @returns {Set<string>}
 */
export function extractKeywords(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return new Set(words.map(normalise));
}

function isEligible(idea, input, tier) {
  if (idea.minGuests !== undefined && input.guestCount < idea.minGuests) return false;
  if (idea.maxGuests !== undefined && input.guestCount > idea.maxGuests) return false;
  return !idea.tiers || idea.tiers.includes(tier);
}

function matchedKeywords(idea, keywords) {
  return idea.tags.filter((tag) => keywords.has(normalise(tag)));
}

// Ideas that fit the guest count and budget, best keyword matches first. The
// original order breaks ties, so results are stable.
function rankIdeas(definition, input, tier, keywords) {
  return definition.ideas
    .filter((idea) => isEligible(idea, input, tier))
    .map((idea, index) => ({ idea, index, matches: matchedKeywords(idea, keywords) }))
    .sort((a, b) => b.matches.length - a.matches.length || a.index - b.index);
}

// Groups the entries that were not already chosen by category, keeping their rank.
function queueByCategory(ranked, chosen) {
  const queues = new Map();
  for (const entry of ranked) {
    if (chosen.has(entry)) continue;
    if (!queues.has(entry.idea.category)) queues.set(entry.idea.category, []);
    queues.get(entry.idea.category).push(entry);
  }
  return queues;
}

// Takes one idea from each category in turn until `picked` has `count` entries.
function fillRoundRobin(picked, queues, count) {
  while (picked.length < count && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const queue of queues.values()) {
      if (picked.length >= count) break;
      if (queue.length > 0) picked.push(queue.shift());
    }
  }
}

/**
 * Picks ideas that fit the guest count and budget, favours those matching the
 * stated theme and interests, then fills the rest with one idea per category in
 * turn so the list stays varied.
 *
 * @param {object} definition The event type definition.
 * @param {object} input A validated event description.
 * @param {number} [count] How many ideas to return.
 * @returns {{ title: string, detail: string, category: string, matchedOn: string[] }[]}
 */
export function selectIdeas(definition, input, count = DEFAULT_IDEA_COUNT) {
  const tier = budgetTier(definition, input);
  const keywords = extractKeywords(`${input.theme} ${input.interests}`);
  const ranked = rankIdeas(definition, input, tier, keywords);

  const picked = ranked.filter((entry) => entry.matches.length > 0).slice(0, Math.ceil(count / 2));
  fillRoundRobin(picked, queueByCategory(ranked, new Set(picked)), count);

  return picked.map(({ idea, matches }) => ({
    title: idea.title,
    detail: idea.detail,
    category: idea.category,
    matchedOn: matches,
  }));
}
