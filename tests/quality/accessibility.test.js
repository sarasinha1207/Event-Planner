import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EVENT_TYPE_KEYS } from '../../src/planner/eventTypes.js';
import { CURRENCY_CODES } from '../../src/planner/currencies.js';
import { parseTags, read } from '../helpers/project.js';

const html = read('public', 'index.html');
const css = read('public', 'css', 'styles.css');
const tags = parseTags(html);
const byName = (name) => tags.filter((tag) => tag.name === name);
const ids = tags.map((tag) => tag.attrs.id).filter(Boolean);

const FORM_CONTROLS = tags.filter(
  (tag) => ['input', 'select', 'textarea'].includes(tag.name) && !['hidden', 'submit', 'button'].includes(tag.attrs.type),
);

describe('page structure', () => {
  it('declares a language, a title and a responsive viewport', () => {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<title>[^<]{10,}<\/title>/);
    const viewport = byName('meta').find((tag) => tag.attrs.name === 'viewport');
    assert.match(viewport.attrs.content, /width=device-width/);
    assert.doesNotMatch(viewport.attrs.content, /user-scalable\s*=\s*no|maximum-scale/);
  });

  it('has landmarks, one h1 and a skip link that targets the main region', () => {
    assert.equal(byName('h1').length, 1);
    for (const landmark of ['header', 'main', 'footer']) assert.equal(byName(landmark).length, 1, landmark);
    const skip = byName('a').find((tag) => tag.attrs.class === 'skip-link');
    assert.equal(skip.attrs.href, '#main');
    assert.equal(byName('main')[0].attrs.id, 'main');
    assert.ok(html.indexOf('skip-link') < html.indexOf('<header'));
  });

  it('does not skip heading levels', () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]));
    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(levels[index] - levels[index - 1] <= 1, `h${levels[index - 1]} to h${levels[index]}`);
    }
  });

  it('has unique ids', () => {
    assert.equal(new Set(ids).size, ids.length);
  });

  it('only references ids that exist', () => {
    const references = ['aria-describedby', 'aria-labelledby', 'aria-controls', 'for'];
    for (const tag of tags) {
      for (const attribute of references) {
        for (const target of (tag.attrs[attribute] ?? '').split(/\s+/).filter(Boolean)) {
          assert.ok(ids.includes(target), `${tag.name} ${attribute}="${target}"`);
        }
      }
    }
  });

  it('keeps landmark regions and the dialog named', () => {
    const regions = byName('section');
    assert.ok(regions.every((tag) => tag.attrs['aria-label'] || tag.attrs['aria-labelledby']));
    assert.ok(byName('dialog').every((tag) => tag.attrs['aria-labelledby']));
  });

  it('announces status messages politely', () => {
    const status = byName('p').find((tag) => tag.attrs.id === 'status');
    assert.equal(status.attrs.role, 'status');
    assert.equal(status.attrs['aria-live'], 'polite');
  });

  it('provides a message for visitors without scripts', () => {
    assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
  });
});

describe('form accessibility', () => {
  it('gives every control a programmatic label', () => {
    const labelled = new Set(byName('label').map((tag) => tag.attrs.for).filter(Boolean));
    for (const control of FORM_CONTROLS) {
      const hasLabel = labelled.has(control.attrs.id) || control.attrs['aria-label'] || control.attrs['aria-labelledby'];
      assert.ok(hasLabel, `${control.name}#${control.attrs.id} has no label`);
    }
  });

  it('marks required fields in text, not only with styling', () => {
    const required = FORM_CONTROLS.filter((control) => 'required' in control.attrs);
    assert.equal(required.length, 4);
    for (const control of required) {
      const label = new RegExp(`<label[^>]*for="${control.attrs.id}"[^>]*>([\\s\\S]*?)</label>`).exec(html);
      assert.ok(label, control.attrs.id);
      assert.match(label[1], /\(required\)/, control.attrs.id);
    }
  });

  it('groups related controls with fieldset and legend', () => {
    assert.equal(byName('fieldset').length, 2);
    assert.equal(byName('legend').length, 2);
  });

  it('has an error slot for every validated field', () => {
    for (const field of ['eventType', 'eventName', 'eventDate', 'guestCount', 'currency', 'totalBudget', 'location', 'theme', 'interests', 'priorities']) {
      assert.ok(ids.includes(`error-${field}`), field);
    }
  });

  it('uses suitable input types and autocomplete settings', () => {
    const type = (id) => tags.find((tag) => tag.attrs.id === id).attrs.type;
    assert.equal(type('eventDate'), 'date');
    assert.equal(type('guestCount'), 'number');
    assert.equal(type('totalBudget'), 'number');
    assert.equal(tags.find((tag) => tag.attrs.id === 'eventName').attrs.autocomplete, 'off');
  });

  it('provides an error summary that can receive focus', () => {
    const summary = tags.find((tag) => tag.attrs.id === 'error-summary');
    assert.equal(summary.attrs.tabindex, '-1');
    assert.ok('hidden' in summary.attrs);
  });

  it('uses buttons with visible text', () => {
    for (const tag of byName('button')) {
      const end = html.indexOf('</button>', tag.index);
      const text = html.slice(tag.index, end).replace(/<[^>]*>/g, '').trim();
      assert.ok(text.length > 0, tag.attrs.id);
    }
  });
});

describe('consistency with the server', () => {
  it('offers exactly the event types the server supports', () => {
    const radios = FORM_CONTROLS.filter((tag) => tag.attrs.type === 'radio').map((tag) => tag.attrs.value);
    assert.deepEqual([...radios].sort(), [...EVENT_TYPE_KEYS].sort());
  });

  it('offers exactly the currencies the server supports', () => {
    const start = html.indexOf('<select id="currency"');
    const options = [...html.slice(start, html.indexOf('</select>', start)).matchAll(/<option value="([A-Z]{3})"/g)].map((match) => match[1]);
    assert.deepEqual([...options].sort(), [...CURRENCY_CODES].sort());
  });
});

describe('stylesheet accessibility', () => {
  it('shows a visible keyboard focus indicator', () => {
    assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px/);
  });

  it('never removes outlines except for programmatic focus targets', () => {
    const removals = [...css.matchAll(/([^{}]+)\{[^}]*outline:\s*none[^}]*\}/g)].map((match) => match[1].trim());
    assert.deepEqual(removals, ['[tabindex="-1"]:focus']);
  });

  it('respects user preferences', () => {
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /prefers-color-scheme:\s*dark/);
    assert.match(css, /forced-colors:\s*active/);
    assert.match(css, /@media print/);
  });

  it('keeps touch targets at least 44 pixels tall', () => {
    const minimums = [...css.matchAll(/min-height:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));
    assert.ok(minimums.filter((value) => value >= 2.75).length >= 5);
    assert.match(css, /\.button\s*\{[^}]*min-height:\s*2\.75rem/);
  });

  it('sizes text in relative units', () => {
    assert.doesNotMatch(css, /font-size:\s*[\d.]+px/);
  });

  it('provides a visually hidden utility that keeps content available to screen readers', () => {
    const rule = /\.visually-hidden\s*\{([^}]*)\}/.exec(css)[1];
    assert.match(rule, /position:\s*absolute/);
    assert.doesNotMatch(rule, /display:\s*none|visibility:\s*hidden/);
  });
});
