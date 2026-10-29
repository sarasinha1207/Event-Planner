// Connects the static event form in index.html to the rest of the app: reading
// values, filling them back in, building the priority checkboxes and showing
// validation errors in an accessible way.

import { h } from './dom.js';

const TEXT_FIELDS = ['eventName', 'eventDate', 'guestCount', 'totalBudget', 'currency', 'location', 'theme', 'interests'];

// Where an error link should send the keyboard focus.
const FOCUS_TARGETS = { eventType: 'type-wedding', priorities: 'priority-options', form: 'submit-button', body: 'submit-button' };
const CONTROL_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/**
 * Applies the server's input limits to the form controls.
 *
 * @param {HTMLFormElement} form
 * @param {Record<string, number>} limits
 * @param {string} todayIso
 * @returns {void}
 */
export function applyLimits(form, limits, todayIso) {
  const { elements } = form;
  elements.eventName.maxLength = limits.nameMax;
  elements.location.maxLength = limits.locationMax;
  elements.theme.maxLength = limits.themeMax;
  elements.interests.maxLength = limits.interestsMax;
  elements.guestCount.max = limits.guestsMax;
  elements.totalBudget.min = limits.budgetMin;
  elements.eventDate.min = todayIso;
}

/**
 * Reads the form into the event description the server expects.
 *
 * @param {HTMLFormElement} form
 * @returns {object}
 */
export function readEvent(form) {
  const event = { eventType: form.elements.eventType.value };
  for (const name of TEXT_FIELDS) event[name] = form.elements[name].value;
  event.priorities = [...form.querySelectorAll('input[name="priorities"]:checked')].map((input) => input.value);
  return event;
}

/**
 * Fills the form from a saved event description.
 *
 * @param {HTMLFormElement} form
 * @param {object} event
 * @returns {void}
 */
export function writeEvent(form, event) {
  const radio = form.querySelector(`input[name="eventType"][value="${event.eventType}"]`);
  if (radio) radio.checked = true;
  for (const name of TEXT_FIELDS) form.elements[name].value = event[name] ?? '';
}

/**
 * Draws the priority checkboxes and stops more than `max` from being chosen.
 *
 * @param {HTMLElement} container
 * @param {{ key: string, label: string }[]} options
 * @param {string[]} selected
 * @param {number} max
 * @returns {void}
 */
export function renderPriorities(container, options, selected, max) {
  const chosen = new Set(selected);

  function enforceLimit() {
    const boxes = [...container.querySelectorAll('input')];
    const full = boxes.filter((box) => box.checked).length >= max;
    for (const box of boxes) box.disabled = full && !box.checked;
  }

  container.replaceChildren(
    ...options.map((option) =>
      h(
        'label',
        { class: 'check-label' },
        h('input', {
          type: 'checkbox',
          name: 'priorities',
          value: option.key,
          checked: chosen.has(option.key),
          on: { change: enforceLimit },
        }),
        h('span', { text: option.label }),
      ),
    ),
  );
  enforceLimit();
}

/**
 * Hides every validation message.
 *
 * @param {HTMLFormElement} form
 * @param {HTMLElement} summary
 * @returns {void}
 */
export function clearErrors(form, summary) {
  summary.hidden = true;
  summary.querySelector('ul').replaceChildren();
  for (const message of form.querySelectorAll('.field-error')) {
    message.hidden = true;
    message.textContent = '';
  }
  for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
}

/**
 * Shows validation messages next to their fields and in a summary that receives focus.
 *
 * @param {HTMLFormElement} form
 * @param {HTMLElement} summary
 * @param {{ field: string, message: string }[]} errors
 * @returns {void}
 */
export function showErrors(form, summary, errors) {
  clearErrors(form, summary);

  const items = errors.map(({ field, message }) => {
    const target = FOCUS_TARGETS[field] ?? field;
    const slot = form.querySelector(`#error-${field}`);
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
    }
    const control = form.querySelector(`#${target}`);
    if (control && CONTROL_TAGS.has(control.tagName)) control.setAttribute('aria-invalid', 'true');
    return h('li', {}, h('a', { href: `#${target}`, text: message }));
  });

  summary.querySelector('ul').replaceChildren(...items);
  summary.hidden = false;
  summary.focus();
}
