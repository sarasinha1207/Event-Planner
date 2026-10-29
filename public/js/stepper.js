/**
 * Shows which of the planning steps the visitor is on. Earlier steps are marked
 * complete and the current one is exposed with aria-current="step".
 *
 * @param {HTMLElement} list The ordered list of steps.
 * @param {number} current One-based number of the current step.
 * @returns {void}
 */
export function markStep(list, current) {
  [...list.children].forEach((item, index) => {
    const number = index + 1;
    if (number === current) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
    item.classList.toggle('is-complete', number < current);
  });
}
