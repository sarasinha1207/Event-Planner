import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiUnavailableError } from '../../src/ai/anthropicClient.js';
import { createAssistantService } from '../../src/ai/assistantService.js';
import { silentLogger } from '../../src/logger.js';
import { TODAY, buildTestPlan } from '../helpers/fixtures.js';

const plan = buildTestPlan();
const aiIdeas = JSON.stringify([
  { title: 'Lantern release', detail: 'Release paper lanterns at dusk.', category: 'Decor' },
  { title: 'Chai cart', detail: 'Serve fresh chai after dinner.', category: 'Food' },
]);

function fakeClient(respond, enabled = true) {
  const calls = [];
  return {
    enabled,
    calls,
    async complete(request) {
      calls.push(request);
      return respond(request);
    },
  };
}

const serviceFor = (client) => createAssistantService({ aiClient: client, logger: silentLogger });

describe('assistant service ideas', () => {
  it('returns AI ideas when the model answers well', async () => {
    const client = fakeClient(() => aiIdeas);
    const result = await serviceFor(client).generateIdeas(plan);
    assert.equal(result.source, 'ai');
    assert.deepEqual(result.items.map((idea) => idea.title), ['Lantern release', 'Chai cart']);
    assert.match(client.calls[0].prompt, /<event_details>/);
  });

  it('caches AI ideas for identical events', async () => {
    const client = fakeClient(() => aiIdeas);
    const service = serviceFor(client);
    await service.generateIdeas(plan);
    await service.generateIdeas(plan);
    assert.equal(client.calls.length, 1);
    await service.generateIdeas(buildTestPlan({ guestCount: 121 }));
    assert.equal(client.calls.length, 2);
  });

  it('falls back to the built-in planner when the model fails', async () => {
    const warnings = [];
    const service = createAssistantService({
      aiClient: fakeClient(() => { throw new AiUnavailableError('down'); }),
      logger: { ...silentLogger, warn: (event, fields) => warnings.push({ event, fields }) },
    });
    const result = await service.generateIdeas(plan);
    assert.equal(result.source, 'builtin');
    assert.ok(result.items.length >= 6);
    assert.equal(warnings[0].event, 'ai_request_failed');
  });

  it('falls back when the model returns something unusable', async () => {
    const result = await serviceFor(fakeClient(() => 'Sorry, I cannot help with that.')).generateIdeas(plan);
    assert.equal(result.source, 'builtin');
  });

  it('does not cache fallback results', async () => {
    let healthy = false;
    const client = fakeClient(() => (healthy ? aiIdeas : 'nope'));
    const service = serviceFor(client);
    assert.equal((await service.generateIdeas(plan)).source, 'builtin');
    healthy = true;
    assert.equal((await service.generateIdeas(plan)).source, 'ai');
  });

  it('never calls the model when AI is disabled', async () => {
    const client = fakeClient(() => aiIdeas, false);
    const service = serviceFor(client);
    assert.equal(service.enabled, false);
    assert.equal((await service.generateIdeas(plan)).source, 'builtin');
    assert.equal(client.calls.length, 0);
  });
});

describe('assistant service questions', () => {
  it('returns the AI answer', async () => {
    const client = fakeClient(() => 'Book the venue first.');
    const result = await serviceFor(client).answerQuestion(plan, 'What first?', TODAY);
    assert.deepEqual(result, { source: 'ai', answer: 'Book the venue first.' });
    assert.match(client.calls[0].prompt, /<question>What first\?<\/question>/);
  });

  it('falls back to a built-in answer when the model fails', async () => {
    const client = fakeClient(() => { throw new Error('boom'); });
    const result = await serviceFor(client).answerQuestion(plan, 'How should I split my budget?', TODAY);
    assert.equal(result.source, 'builtin');
    assert.match(result.answer, /budget/i);
  });

  it('answers locally when AI is disabled', async () => {
    const result = await serviceFor(fakeClient(() => 'x', false)).answerQuestion(plan, 'timeline?', TODAY);
    assert.equal(result.source, 'builtin');
  });
});
