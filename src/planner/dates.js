// Calendar helpers. Dates are plain "YYYY-MM-DD" strings and every calculation
// is done in UTC so results never depend on the server's time zone.

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Parses a YYYY-MM-DD string into a UTC Date, or null when it is not a real calendar date.
 *
 * @param {unknown} value
 * @returns {Date | null}
 */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? date : null;
}

/**
 * Formats a Date as YYYY-MM-DD in UTC.
 *
 * @param {Date} date
 * @returns {string}
 */
export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Today's date in UTC as YYYY-MM-DD.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function todayIso(now = new Date()) {
  return toIsoDate(now);
}

/**
 * Adds days (negative to go back) to an ISO date.
 *
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 * @throws {RangeError} When `iso` is not a valid date.
 */
export function addDays(iso, days) {
  const date = parseIsoDate(iso);
  if (!date) throw new RangeError(`Invalid ISO date: ${iso}`);
  return toIsoDate(new Date(date.getTime() + days * MS_PER_DAY));
}

/**
 * Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier.
 *
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number}
 * @throws {RangeError} When either date is invalid.
 */
export function diffDays(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) throw new RangeError('Invalid ISO date');
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}
