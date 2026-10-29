// Tracks what the user has done: completed tasks, vendor steps and money spent.
// Every function is pure and returns new objects, which keeps the views simple
// and the logic easy to test.

import { percentage } from './format.js';

const isDone = (value) => value === true;
const isPositiveAmount = (value) => Number.isFinite(value) && value > 0;

/**
 * Progress with nothing done and nothing spent.
 *
 * @returns {{ tasks: object, steps: object, spent: object }}
 */
export function emptyProgress() {
  return { tasks: {}, steps: {}, spent: {} };
}

function withFlag(map, id, done) {
  const next = { ...map };
  if (done) next[id] = true;
  else delete next[id];
  return next;
}

/**
 * A copy of the progress with one task marked done or not done.
 *
 * @param {object} progress
 * @param {string} id
 * @param {boolean} done
 * @returns {object}
 */
export function setTaskDone(progress, id, done) {
  return { ...progress, tasks: withFlag(progress.tasks, id, done) };
}

/**
 * A copy of the progress with one vendor step marked done or not done.
 *
 * @param {object} progress
 * @param {string} id
 * @param {boolean} done
 * @returns {object}
 */
export function setStepDone(progress, id, done) {
  return { ...progress, steps: withFlag(progress.steps, id, done) };
}

/**
 * A copy of the progress with the amount spent on one category. Zero or invalid amounts remove it.
 *
 * @param {object} progress
 * @param {string} key
 * @param {number} amount
 * @returns {object}
 */
export function setSpent(progress, key, amount) {
  const spent = { ...progress.spent };
  if (isPositiveAmount(amount)) spent[key] = amount;
  else delete spent[key];
  return { ...progress, spent };
}

// The entries of `map` whose id is known and whose value passes `isValid`.
function keepValid(map, knownIds, isValid) {
  const source = map ?? {};
  return Object.fromEntries(knownIds.filter((id) => Object.hasOwn(source, id) && isValid(source[id])).map((id) => [id, source[id]]));
}

/**
 * Keeps only progress that still refers to something in the plan and that has a
 * valid value. Used after a plan is rebuilt and when loading saved data.
 *
 * @param {unknown} raw
 * @param {object} plan
 * @returns {object}
 */
export function reconcileProgress(raw, plan) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const taskIds = plan.timeline.tasks.map((task) => task.id);
  const stepIds = plan.vendors.flatMap((vendor) => vendor.checklist.map((step) => step.id));
  const lineKeys = plan.budget.lines.map((line) => line.key);

  return {
    tasks: keepValid(source.tasks, taskIds, isDone),
    steps: keepValid(source.steps, stepIds, isDone),
    spent: keepValid(source.spent, lineKeys, isPositiveAmount),
  };
}

/**
 * How many timeline tasks are done.
 *
 * @param {object} plan
 * @param {object} progress
 * @returns {{ done: number, total: number, percent: number }}
 */
export function taskStats(plan, progress) {
  const total = plan.timeline.tasks.length;
  const done = plan.timeline.tasks.filter((task) => progress.tasks[task.id] === true).length;
  return { done, total, percent: percentage(done, total) };
}

/**
 * How many steps of one vendor are done.
 *
 * @param {object} vendor
 * @param {object} progress
 * @returns {{ done: number, total: number }}
 */
export function vendorStats(vendor, progress) {
  const total = vendor.checklist.length;
  const done = vendor.checklist.filter((step) => progress.steps[step.id] === true).length;
  return { done, total };
}

/**
 * What has been spent in one budget category.
 *
 * @param {object} line
 * @param {object} progress
 * @returns {{ spent: number, remaining: number, over: boolean }}
 */
export function lineSpend(line, progress) {
  const spent = progress.spent[line.key] ?? 0;
  return { spent, remaining: line.amount - spent, over: spent > line.amount };
}

/**
 * What has been spent across the whole budget.
 *
 * @param {object} plan
 * @param {object} progress
 * @returns {{ planned: number, spent: number, remaining: number, over: boolean }}
 */
export function spendTotals(plan, progress) {
  const planned = plan.budget.total;
  const spent = plan.budget.lines.reduce((sum, line) => sum + (progress.spent[line.key] ?? 0), 0);
  return { planned, spent, remaining: planned - spent, over: spent > planned };
}
