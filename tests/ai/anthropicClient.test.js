import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiUnavailableError, createAnthropicClient } from '../../src/ai/anthropicClient.js';

const SECRET = 'sk-ant-test-secret-value';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function clientWith(fetchImpl, apiKey = SECRET) {
  return createAnthropicClient({ apiKey, model: 'test-model', timeoutMs: 1000, fetchImpl });
}

const request = { system: 'sys', prompt: 'hello', maxTokens: 50 };

describe('createAnthropicClient', () => {
  it('is disabled without a key and never calls the network', async () => {
    let called = false;
    const client = clientWith(async () => { called = true; }, '');
    assert.equal(client.enabled, false);
    await assert.rejects(client.complete(request), AiUnavailableError);
    assert.equal(called, false);
  });

  it('sends the documented request shape', async () => {
    let seen;
    const client = clientWith(async (url, options) => {
      seen = { url, options };
      return jsonResponse({ content: [{ type: 'text', text: 'Hi there' }] });
    });

    assert.equal(await client.complete(request), 'Hi there');
    assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(seen.options.method, 'POST');
    assert.equal(seen.options.headers['x-api-key'], SECRET);
    assert.equal(seen.options.headers['anthropic-version'], '2023-06-01');
    assert.ok(seen.options.signal);
    assert.deepEqual(JSON.parse(seen.options.body), {
      model: 'test-model',
      max_tokens: 50,
      system: 'sys',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('joins text blocks and ignores other block types', async () => {
    const client = clientWith(async () =>
      jsonResponse({ content: [{ type: 'text', text: 'One ' }, { type: 'tool_use' }, { type: 'text', text: 'two' }] }),
    );
    assert.equal(await client.complete(request), 'One two');
  });

  it('wraps network failures without leaking the key', async () => {
    const client = clientWith(async () => { throw new Error(`connect failed for ${SECRET}`); });
    await assert.rejects(client.complete(request), (error) => {
      assert.ok(error instanceof AiUnavailableError);
      assert.ok(!error.message.includes(SECRET));
      return true;
    });
  });

  it('reports error statuses', async () => {
    const client = clientWith(async () => jsonResponse({}, { ok: false, status: 529 }));
    await assert.rejects(client.complete(request), /status 529/);
  });

  it('rejects unreadable and empty responses', async () => {
    const unreadable = clientWith(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }));
    await assert.rejects(unreadable.complete(request), /unreadable/);

    for (const body of [{}, { content: [] }, { content: [{ type: 'text', text: '   ' }] }, null]) {
      const empty = clientWith(async () => jsonResponse(body));
      await assert.rejects(empty.complete(request), /empty/);
    }
  });
});
