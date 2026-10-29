// Pure formatting helpers shared by every view and by the text export.

const MS_PER_DAY = 86_400_000;

/**
 * Uses the browser's language for number and date formats when it is supported.
 *
 * @param {string} language
 * @returns {string}
 */
export function pickLocale(language) {
  try {
    return Intl.NumberFormat.supportedLocalesOf([language]).length > 0 ? language : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Formats a whole amount in a currency without decimals.
 *
 * @param {number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amount, currency, locale = 'en') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseIso(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Dates are calendar dates, so they are always formatted in UTC to avoid the
 * off-by-one-day errors that time zones cause.
 *
 * @param {string} iso
 * @param {string} [locale]
 * @returns {string}
 */
export function formatDate(iso, locale = 'en') {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseIso(iso));
}

/**
 * Today's date in the visitor's own time zone as YYYY-MM-DD.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function localTodayIso(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whole days from one ISO date to another; negative when the second is earlier.
 *
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number}
 */
export function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / MS_PER_DAY);
}

/**
 * Joins a count and a word, for example `1 day` or `2 days`.
 *
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 * @returns {string}
 */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * A whole-number percentage, or 0 when there is nothing to divide by.
 *
 * @param {number} part
 * @param {number} whole
 * @returns {number}
 */
export function percentage(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Describes how a due date relates to today. `state` drives styling, while
 * `text` always carries the meaning so colour is never the only signal.
 *
 * @param {string} dueIso
 * @param {string} todayIso
 * @param {boolean} done
 * @returns {{ state: string, text: string }}
 */
export function describeDue(dueIso, todayIso, done) {
  if (done) return { state: 'done', text: 'Done' };
  const days = daysBetween(todayIso, dueIso);
  if (days < 0) return { state: 'overdue', text: `Overdue by ${pluralize(-days, 'day')}` };
  if (days === 0) return { state: 'today', text: 'Due today' };
  if (days === 1) return { state: 'upcoming', text: 'Due tomorrow' };
  return { state: 'upcoming', text: `Due in ${pluralize(days, 'day')}` };
}
