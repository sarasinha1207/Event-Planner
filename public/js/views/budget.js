import { h } from '../dom.js';
import { formatMoney } from '../format.js';
import { lineSpend, spendTotals } from '../progress.js';

const COLUMN_HEADINGS = Object.freeze(['Category', 'Share', 'Planned', 'Spent so far', 'Remaining']);

/**
 * Reads an amount typed by the visitor. Anything that is not a positive number counts as zero.
 *
 * @param {string} text
 * @returns {number}
 */
export function parseAmount(text) {
  const value = Number(String(text).trim());
  return String(text).trim() !== '' && Number.isFinite(value) && value > 0 ? value : 0;
}

// A thin bar showing each category's share relative to the largest one.
function shareBar(line, largestShare) {
  const fill = h('span', { class: 'bar-fill' });
  fill.style.setProperty('--fill', String(Math.round((line.share / largestShare) * 100)));
  return h('span', { class: 'bar', 'aria-hidden': 'true' }, fill);
}

function tableHead() {
  return h('thead', {}, h('tr', {}, COLUMN_HEADINGS.map((text) => h('th', { scope: 'col', text }))));
}

/**
 * The Budget tab: a table where the visitor enters what has been spent.
 *
 * @param {{ plan: object, progress: object, locale: string, onSpentChange: (key: string, amount: number) => void }} options
 * @returns {{ element: HTMLElement }}
 */
export function createBudgetView({ plan, progress, locale, onSpentChange }) {
  const money = (amount) => formatMoney(amount, plan.budget.currency, locale);
  const largestShare = Math.max(...plan.budget.lines.map((line) => line.share));
  const totalSpent = h('td');
  const totalRemaining = h('td');
  let current = progress;

  function remainingText({ remaining, over }) {
    return over ? `Over by ${money(-remaining)}` : `${money(remaining)} left`;
  }

  function paintTotals() {
    const totals = spendTotals(plan, current);
    totalSpent.textContent = money(totals.spent);
    totalRemaining.textContent = remainingText(totals);
    totalRemaining.classList.toggle('is-over', totals.over);
  }

  function createRow(line) {
    const remainingCell = h('td', { 'data-label': 'Remaining' });
    const input = h('input', {
      type: 'number',
      min: '0',
      step: 'any',
      inputmode: 'decimal',
      class: 'amount-input',
      'aria-label': `Amount spent on ${line.label}`,
      value: current.spent[line.key] ?? '',
    });

    function paint(state) {
      remainingCell.textContent = remainingText(state);
      remainingCell.classList.toggle('is-over', state.over);
    }

    input.addEventListener('input', () => {
      const amount = parseAmount(input.value);
      current = { ...current, spent: { ...current.spent } };
      if (amount > 0) current.spent[line.key] = amount;
      else delete current.spent[line.key];
      paint(lineSpend(line, current));
      paintTotals();
      onSpentChange(line.key, amount);
    });

    paint(lineSpend(line, current));

    return h(
      'tr',
      {},
      h(
        'th',
        { scope: 'row' },
        h('span', { class: 'row-title', text: line.label }),
        line.priority ? h('span', { class: 'badge', text: 'Priority' }) : null,
        h('span', { class: 'cell-hint', text: line.hint }),
      ),
      h('td', { 'data-label': 'Share', text: `${line.share}%` }),
      h('td', { 'data-label': 'Planned' }, h('span', { text: money(line.amount) }), shareBar(line, largestShare)),
      h('td', { 'data-label': 'Spent' }, input),
      remainingCell,
    );
  }

  const table = h(
    'table',
    { class: 'data-table' },
    h('caption', { class: 'visually-hidden', text: `Budget breakdown in ${plan.budget.currency}` }),
    tableHead(),
    h('tbody', {}, plan.budget.lines.map(createRow)),
    h(
      'tfoot',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'row', text: 'Total' }),
        h('td', { text: '100%' }),
        h('td', { text: money(plan.budget.total) }),
        totalSpent,
        totalRemaining,
      ),
    ),
  );
  paintTotals();

  const element = h(
    'div',
    { class: 'budget-view' },
    h('h3', { text: 'Budget breakdown' }),
    h('p', {
      class: 'section-intro',
      text: 'Amounts add up exactly to your total. Enter what you spend in each category to see how much remains.',
    }),
    h('div', { class: 'table-scroll', role: 'region', 'aria-label': 'Budget table', tabindex: '0' }, table),
  );

  return { element };
}
