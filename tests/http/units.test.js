import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { loadConfig } from '../../src/config.js';
import { readJsonBody } from '../../src/http/body.js';
import { HttpError } from '../../src/http/errors.js';
import { createRateLimiter } from '../../src/http/rateLimiter.js';
import { createRouter } from '../../src/http/router.js';
import { SECURITY_HEADERS, applySecurityHeaders } from '../../src/http/security.js';
import { createLogger, silentLogger } from '../../src/logger.js';

function fakeRequest(body, headers = { 'content-type': 'application/json' }) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  stream.headers = headers;
  return stream;
}

describe('rate limiter', () => {
  it('allows requests up to the limit then blocks', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => 0 });
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.check('a').allowed), [true, true, true, false]);
  });

  it('tracks clients separately', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('b').allowed, true);
    assert.equal(limiter.check('a').allowed, false);
  });

  it('starts a new window after the old one ends', () => {
    let clock = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => clock });
    limiter.check('a');
    assert.equal(limiter.check('a').allowed, false);
    clock = 1000;
    assert.equal(limiter.check('a').allowed, true);
  });

  it('reports how long to wait', () => {
    let clock = 0;
    const limiter = createRateLimiter({ windowMs: 10_000, max: 1, now: () => clock });
    limiter.check('a');
    clock = 2500;
    assert.equal(limiter.check('a').retryAfterSeconds, 8);
  });

  it('purges expired entries when it grows large', () => {
    let clock = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => clock });
    for (let n = 0; n < 5001; n += 1) limiter.check(`client-${n}`);
    assert.equal(limiter.size, 5001);
    clock = 5000;
    limiter.check('fresh');
    assert.equal(limiter.size, 1);
  });
});

describe('readJsonBody', () => {
  it('parses a JSON body', async () => {
    assert.deepEqual(await readJsonBody(fakeRequest('{"a":1}'), { maxBytes: 100 }), { a: 1 });
  });

  it('accepts a charset parameter on the content type', async () => {
    const req = fakeRequest('{"a":1}', { 'content-type': 'Application/JSON; charset=utf-8' });
    assert.deepEqual(await readJsonBody(req, { maxBytes: 100 }), { a: 1 });
  });

  it('rejects other content types', async () => {
    for (const headers of [{}, { 'content-type': 'text/plain' }, { 'content-type': 'application/x-www-form-urlencoded' }]) {
      await assert.rejects(readJsonBody(fakeRequest('{}', headers), { maxBytes: 100 }), (error) => error.status === 415);
    }
  });

  it('rejects invalid JSON and empty bodies', async () => {
    await assert.rejects(readJsonBody(fakeRequest('{oops'), { maxBytes: 100 }), (error) => error.status === 400);
    await assert.rejects(readJsonBody(fakeRequest(undefined), { maxBytes: 100 }), (error) => error.status === 400);
  });

  it('rejects oversized bodies by declared length', async () => {
    const req = fakeRequest('{}', { 'content-type': 'application/json', 'content-length': '5000' });
    await assert.rejects(readJsonBody(req, { maxBytes: 100 }), (error) => error.status === 413 && error.headers.Connection === 'close');
  });

  it('rejects oversized bodies by actual length', async () => {
    const body = JSON.stringify({ text: 'x'.repeat(500) });
    await assert.rejects(readJsonBody(fakeRequest(body), { maxBytes: 100 }), (error) => error.status === 413);
  });
});

describe('router', () => {
  const router = createRouter([
    { method: 'GET', path: '/a', handler: () => 'get' },
    { method: 'POST', path: '/a', handler: () => 'post' },
  ]);

  it('finds routes by method and path', () => {
    assert.equal(router.resolve('GET', '/a').handler(), 'get');
    assert.equal(router.resolve('POST', '/a').handler(), 'post');
  });

  it('throws 404 for unknown paths', () => {
    assert.throws(() => router.resolve('GET', '/b'), (error) => error instanceof HttpError && error.status === 404);
  });

  it('throws 405 with an Allow header for known paths', () => {
    assert.throws(() => router.resolve('DELETE', '/a'), (error) => error.status === 405 && error.headers.Allow === 'GET, POST');
  });
});

describe('security headers', () => {
  it('applies every header to a response', () => {
    const headers = new Map();
    applySecurityHeaders({ setHeader: (name, value) => headers.set(name, value) });
    assert.equal(headers.size, Object.keys(SECURITY_HEADERS).length);
  });

  it('uses a strict content security policy', () => {
    const policy = SECURITY_HEADERS['Content-Security-Policy'];
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /script-src 'self'(;|$)/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  });
});

describe('config', () => {
  it('has safe defaults', () => {
    const config = loadConfig({});
    assert.equal(config.port, 3000);
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.anthropicApiKey, '');
    assert.equal(config.anthropicModel, 'claude-sonnet-5-5');
    assert.ok(config.aiRateLimitMax < config.rateLimitMax);
  });

  it('reads overrides and trims the key', () => {
    const config = loadConfig({ PORT: '8080', HOST: '0.0.0.0', ANTHROPIC_API_KEY: '  key  ', AI_RATE_LIMIT_MAX: '3' });
    assert.equal(config.port, 8080);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.anthropicApiKey, 'key');
    assert.equal(config.aiRateLimitMax, 3);
  });

  it('treats empty values as unset', () => {
    assert.equal(loadConfig({ PORT: '' }).port, 3000);
  });

  it('rejects invalid numbers', () => {
    for (const PORT of ['abc', '-1', '70000', '3.5']) {
      assert.throws(() => loadConfig({ PORT }), /PORT/);
    }
  });

  it('is immutable', () => {
    assert.throws(() => {
      'use strict';
      loadConfig({}).port = 1;
    }, TypeError);
  });
});

describe('logger', () => {
  it('writes one JSON line per event', () => {
    const lines = [];
    const logger = createLogger({ write: (line) => lines.push(line), clock: () => new Date('2026-10-23T00:00:00Z') });
    logger.info('started', { port: 1 });
    logger.warn('careful');
    logger.error('failed', { code: 5 });
    const parsed = lines.map((line) => JSON.parse(line));
    assert.deepEqual(parsed[0], { time: '2026-10-23T00:00:00.000Z', level: 'info', event: 'started', port: 1 });
    assert.deepEqual(parsed.map((entry) => entry.level), ['info', 'warn', 'error']);
  });

  it('provides a silent logger for tests', () => {
    assert.doesNotThrow(() => {
      silentLogger.info('x');
      silentLogger.warn('x');
      silentLogger.error('x');
    });
  });
});
