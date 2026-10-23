// Built-in answers for the "Ask the planner" box. Used whenever the AI service
// is not configured or cannot be reached, so the feature never goes dark.

const TOPICS = [
  { id: 'budget', words: ['budget', 'cost', 'spend', 'afford', 'money', 'price', 'expensive', 'cheap', 'pay', 'save', 'saving'] },
  { id: 'timeline', words: ['timeline', 'when', 'deadline', 'schedule', 'start', 'soon', 'next', 'task', 'late', 'plan'] },
  { id: 'vendors', words: ['vendor', 'book', 'hire', 'supplier', 'contract', 'quote', 'caterer', 'photographer', 'venue'] },
  { id: 'guests', words: ['guest', 'headcount', 'rsvp', 'invite', 'attendee', 'people', 'capacity', 'crowd'] },
  { id: 'ideas', words: ['idea', 'theme', 'decor', 'entertain', 'suggest', 'fun', 'activity', 'inspiration', 'music'] },
];

const MAX_LISTED = 3;

export function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function tokenise(question) {
  return String(question).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function pickTopic(question) {
  const tokens = tokenise(question);
  let best = null;
  let bestScore = 0;
  for (const topic of TOPICS) {
    const score = tokens.filter((token) => topic.words.some((word) => token.startsWith(word))).length;
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}

function answerBudget(plan) {
  const { budget, input, summary } = plan;
  const top = [...budget.lines]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_LISTED)
    .map((line) => `${line.label} (${formatMoney(line.amount, budget.currency)})`);
  const reserve = budget.lines.find((line) => line.key === 'contingency');
  return (
    `Your total budget is ${formatMoney(budget.total, budget.currency)}, which is about ` +
    `${formatMoney(summary.budgetPerGuest, budget.currency)} per guest for ${input.guestCount} guests. ` +
    `The largest lines are ${top.join(', ')}. ` +
    `${formatMoney(reserve.amount, budget.currency)} is held in reserve; avoid spending it until the final weeks.`
  );
}

function answerTimeline(plan, today) {
  const upcoming = plan.timeline.tasks.filter((task) => task.dueDate >= today).slice(0, MAX_LISTED);
  if (upcoming.length === 0) return 'Every planned task is now past its due date. Review the timeline and complete any open items.';
  const list = upcoming.map((task) => `${task.title} (due ${task.dueDate})`).join('; ');
  const note = plan.summary.compressed
    ? ' Your event is closer than the recommended lead time, so dates have been compressed; book key vendors first.'
    : '';
  return `Your next tasks are: ${list}.${note}`;
}

function answerVendors(plan) {
  const first = plan.vendors.slice(0, MAX_LISTED).map((vendor) => `${vendor.label} (book by ${vendor.bookBy})`);
  return (
    `Book the vendors with the longest lead times first: ${first.join(', ')}. ` +
    'For each one, collect at least three written quotes, read the cancellation terms and record when the balance is due.'
  );
}

function answerGuests(plan) {
  const { input, summary, budget } = plan;
  const catering = budget.lines.find((line) => line.key === 'catering');
  const perGuest = catering ? formatMoney(Math.round(catering.amount / input.guestCount), budget.currency) : null;
  return (
    `You are planning for ${input.guestCount} guests. ` +
    (perGuest ? `Food and drink works out at about ${perGuest} per guest. ` : '') +
    `Your budget tier is ${summary.budgetTier}. Close RSVPs three to four weeks before the event so you can confirm final numbers with vendors.`
  );
}

function answerIdeas(plan) {
  const titles = plan.ideas.items.slice(0, MAX_LISTED).map((idea) => idea.title);
  return `Ideas that fit your plan: ${titles.join('; ')}. Open the Ideas tab for details and add a theme or interests to personalise them further.`;
}

const ANSWERS = {
  budget: answerBudget,
  timeline: answerTimeline,
  vendors: answerVendors,
  guests: answerGuests,
  ideas: answerIdeas,
};

export const HELP_TEXT =
  'I can answer questions about your budget, timeline, vendors, guest numbers and ideas. ' +
  'Try asking: "How should I split my budget?" or "What should I do next?"';

export function answerLocally(question, plan, today) {
  const topic = pickTopic(question);
  return topic ? ANSWERS[topic](plan, today) : HELP_TEXT;
}
