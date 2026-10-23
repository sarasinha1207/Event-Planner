// Builds a plain-text copy of the plan that can be saved or printed.

import { formatDate, formatMoney } from './format.js';
import { lineSpend, spendTotals } from './progress.js';

// Turns an event name into a safe download file name.
export function fileSlug(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'event';
}

function section(title, lines) {
  return [title.toUpperCase(), '-'.repeat(title.length), ...lines, ''];
}

export function planToText(plan, progress, locale = 'en') {
  const { input, budget } = plan;
  const money = (amount) => formatMoney(amount, budget.currency, locale);

  const overview = [
    `Event: ${input.eventName} (${plan.eventTypeLabel})`,
    `Date: ${formatDate(input.eventDate, locale)}`,
    `Guests: ${input.guestCount}`,
    `Total budget: ${money(budget.total)} (${money(plan.summary.budgetPerGuest)} per guest)`,
  ];
  if (input.location) overview.push(`Location: ${input.location}`);
  if (input.theme) overview.push(`Theme: ${input.theme}`);

  const totals = spendTotals(plan, progress);
  const budgetLines = budget.lines.map((line) => {
    const { spent } = lineSpend(line, progress);
    return `- ${line.label}: ${money(line.amount)} (${line.share}%), spent ${money(spent)}`;
  });
  budgetLines.push(`Total spent: ${money(totals.spent)} of ${money(totals.planned)}`);

  const timelineLines = plan.timeline.tasks.map((task) => {
    const mark = progress.tasks[task.id] ? '[x]' : '[ ]';
    return `${mark} ${formatDate(task.dueDate, locale)} - ${task.title}`;
  });

  const vendorLines = plan.vendors.flatMap((vendor) => [
    `${vendor.label} - budget ${money(vendor.budget)}, book by ${formatDate(vendor.bookBy, locale)}`,
    ...vendor.checklist.map((step) => `  ${progress.steps[step.id] ? '[x]' : '[ ]'} ${step.text}`),
    ...vendor.questions.map((question) => `  ? ${question}`),
  ]);

  const ideaLines = plan.ideas.items.map((idea) => `- ${idea.title} (${idea.category}): ${idea.detail}`);

  return [
    ...section('Event overview', overview),
    ...section('Budget', budgetLines),
    ...section('Timeline', timelineLines),
    ...section('Vendor checklist', vendorLines),
    ...section('Ideas', ideaLines),
  ].join('\n');
}
