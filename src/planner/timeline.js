import { addDays, diffDays } from './dates.js';

const EVENT_WEEK_DAYS = 7;

export const PHASES = Object.freeze({
  early: 'Early planning',
  booking: 'Booking and design',
  final: 'Final preparations',
  eventWeek: 'Event week',
  after: 'After the event',
});

export function phaseFor(daysBefore, spanDays) {
  if (daysBefore < 0) return PHASES.after;
  if (daysBefore <= EVENT_WEEK_DAYS) return PHASES.eventWeek;
  const position = daysBefore / spanDays;
  if (position >= 2 / 3) return PHASES.early;
  if (position >= 1 / 3) return PHASES.booking;
  return PHASES.final;
}

export function timelineSpan(definition) {
  return Math.max(...definition.timeline.map((task) => task.daysBefore));
}

// Turns "N days before the event" into a real date. When the event is closer
// than the recommended lead time, earlier tasks are compressed proportionally so
// that every task still lands between today and the event, in the same order.
export function createDateScaler({ eventDate, today, spanDays }) {
  const available = Math.max(0, diffDays(today, eventDate));
  const factor = available >= spanDays ? 1 : available / spanDays;

  function offsetFor(daysBefore) {
    if (daysBefore <= 0) return daysBefore;
    if (daysBefore <= EVENT_WEEK_DAYS) return Math.min(daysBefore, available);
    return Math.min(available, Math.max(EVENT_WEEK_DAYS + 1, Math.round(daysBefore * factor)));
  }

  return {
    compressed: factor < 1,
    availableDays: available,
    dateFor: (daysBefore) => addDays(eventDate, -offsetFor(daysBefore)),
  };
}

export function buildTimeline(definition, scaler) {
  const spanDays = timelineSpan(definition);
  const labels = new Map(definition.budget.map((line) => [line.key, line.label]));

  const tasks = definition.timeline
    .map((task, order) => ({
      order,
      id: task.id,
      title: task.title,
      detail: task.detail,
      category: labels.get(task.category) ?? 'Planning',
      phase: phaseFor(task.daysBefore, spanDays),
      dueDate: scaler.dateFor(task.daysBefore),
    }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.order - b.order))
    .map(({ order, ...task }) => task);

  return {
    compressed: scaler.compressed,
    recommendedWeeks: Math.ceil(spanDays / 7),
    tasks,
  };
}
