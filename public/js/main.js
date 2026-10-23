import { createApi, toFieldErrors } from './api.js';
import { launchConfetti } from './confetti.js';
import { openConfirm } from './confirmDialog.js';
import { downloadTextFile } from './download.js';
import { h } from './dom.js';
import { fileSlug, planToText } from './exportText.js';
import { applyLimits, clearErrors, readEvent, renderPriorities, showErrors, writeEvent } from './formView.js';
import { localTodayIso, pickLocale } from './format.js';
import { emptyProgress, reconcileProgress } from './progress.js';
import { buildResults } from './resultsView.js';
import { markStep } from './stepper.js';
import { browserStorage, createStore } from './store.js';

const api = createApi();
const store = createStore(browserStorage());
const state = { meta: null, plan: null, progress: emptyProgress(), busy: false, views: null };

const byId = (id) => document.getElementById(id);
const els = {
  form: byId('event-form'),
  formHeading: byId('form-heading'),
  status: byId('status'),
  errorSummary: byId('error-summary'),
  submit: byId('submit-button'),
  clear: byId('clear-button'),
  priorityOptions: byId('priority-options'),
  info: byId('info-panel'),
  results: byId('results'),
  resultsHeading: byId('results-heading'),
  resultsBody: byId('results-body'),
  dialog: byId('confirm-dialog'),
  steps: byId('stepper'),
};

const locale = pickLocale(navigator.language);

const announce = (message) => {
  els.status.textContent = message;
};

const persist = () => store.save({ plan: state.plan, progress: state.progress });

function setBusy(busy) {
  state.busy = busy;
  els.submit.setAttribute('aria-busy', String(busy));
  els.submit.textContent = busy ? 'Creating your plan...' : 'Create my plan';
}

function refreshPriorities(selected = []) {
  const type = state.meta.eventTypes.find((candidate) => candidate.key === els.form.elements.eventType.value);
  renderPriorities(els.priorityOptions, type ? type.priorities : [], selected, state.meta.maxPriorities);
}

function downloadText() {
  const text = planToText(state.plan, state.progress, locale);
  downloadTextFile(text, `${fileSlug(state.plan.input.eventName)}-plan.txt`);
  announce('Plan downloaded as a text file.');
}

async function requestAiIdeas() {
  const { ideas } = state.views;
  ideas.setBusy(true, 'Generating ideas...');
  try {
    const result = await api.requestIdeas(state.plan.input, localTodayIso());
    state.plan = { ...state.plan, ideas: result.ideas };
    persist();
    ideas.setIdeas(result.ideas);
    ideas.setBusy(
      false,
      result.ideas.source === 'ai' ? 'New ideas generated.' : 'The AI assistant is unavailable right now, so built-in ideas are shown.',
    );
  } catch (error) {
    ideas.setBusy(false, error.message);
  }
}

async function askPlanner(question) {
  const { ask } = state.views;
  ask.setBusy(true);
  try {
    ask.showAnswer(await api.ask(state.plan.input, localTodayIso(), question));
  } catch (error) {
    ask.showError(error.message);
  } finally {
    ask.setBusy(false);
  }
}

function renderResults({ focus }) {
  state.views = buildResults({
    plan: state.plan,
    progress: state.progress,
    meta: state.meta,
    today: localTodayIso(),
    locale,
    actions: {
      onProgressChange: (progress) => {
        state.progress = progress;
        markStep(els.steps, 3);
        persist();
      },
      onRequestAiIdeas: requestAiIdeas,
      onAsk: askPlanner,
      onDownload: downloadText,
      onPrint: () => window.print(),
      onEditDetails: () => {
        els.formHeading.focus();
        els.formHeading.scrollIntoView({ block: 'start' });
      },
    },
  });

  els.resultsHeading.textContent = state.plan.input.eventName;
  els.resultsBody.replaceChildren(...state.views.nodes);
  els.results.hidden = false;
  els.clear.hidden = false;
  markStep(els.steps, 2);
  if (focus) els.resultsHeading.focus();
}

function resetToEmpty() {
  store.clear();
  state.plan = null;
  state.progress = emptyProgress();
  els.form.reset();
  clearErrors(els.form, els.errorSummary);
  refreshPriorities();
  els.results.hidden = true;
  els.clear.hidden = true;
  markStep(els.steps, 1);
  announce('Saved plan cleared.');
  // The dialog is still closing, and it would move focus back to the button that opened it.
  setTimeout(() => els.formHeading.focus(), 0);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.busy) return;
  setBusy(true);
  try {
    const { plan } = await api.createPlan(readEvent(els.form), localTodayIso());
    clearErrors(els.form, els.errorSummary);
    state.plan = plan;
    state.progress = reconcileProgress(state.progress, plan);
    persist();
    renderResults({ focus: true });
    launchConfetti();
    announce(`Plan created for ${plan.input.eventName}.`);
  } catch (error) {
    showErrors(els.form, els.errorSummary, toFieldErrors(error));
  } finally {
    setBusy(false);
  }
}

function restoreSavedPlan() {
  const saved = store.load();
  if (!saved) return;
  state.plan = saved.plan;
  state.progress = saved.progress;
  writeEvent(els.form, saved.plan.input);
  refreshPriorities(saved.plan.input.priorities ?? []);
  renderResults({ focus: false });
  announce('Your saved plan has been restored.');
}

async function init() {
  els.submit.disabled = true;
  try {
    state.meta = await api.getMeta();
  } catch (error) {
    els.info.append(h('p', { class: 'notice', role: 'alert', text: error.message }));
    return;
  }

  applyLimits(els.form, state.meta.limits, localTodayIso());
  refreshPriorities();
  els.submit.disabled = false;

  els.form.addEventListener('submit', handleSubmit);
  els.form.elements.eventType.forEach((radio) => radio.addEventListener('change', () => refreshPriorities()));
  els.clear.addEventListener('click', () => openConfirm(els.dialog, 'Clear your saved plan? This cannot be undone.', resetToEmpty));
  byId('confirm-yes').addEventListener('click', resetToEmpty);

  // Collapsed vendor sections would be missing from a printout, so open them.
  window.addEventListener('beforeprint', () => {
    for (const details of document.querySelectorAll('details.vendor')) details.open = true;
  });

  restoreSavedPlan();
}

init();
