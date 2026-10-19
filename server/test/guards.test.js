const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, createConcurrencyLimiter } = require('../middleware/conversion-guard');

function responseDouble() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    set(name, value) {
      if (typeof name === 'object') Object.assign(this.headers, name);
      else this.headers[name] = value;
      return this;
    },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; },
    on() { return this; },
  };
}

test('rate limiter allows requests until the configured limit and then returns 429', () => {
  const limit = createRateLimiter({ windowMs: 60_000, limit: 2 });
  const req = { ip: '127.0.0.1' };
  let nextCalls = 0;
  limit(req, responseDouble(), () => { nextCalls += 1; });
  limit(req, responseDouble(), () => { nextCalls += 1; });
  const blocked = responseDouble();
  limit(req, blocked, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body.error, /Too many conversion requests/i);
  assert.equal(blocked.headers['X-RateLimit-Remaining'], '0');
});

test('concurrency limiter rejects work above the configured active limit', () => {
  const guard = createConcurrencyLimiter({ limit: 1 });
  const listeners = {};
  const firstRes = {
    statusCode: 200,
    body: undefined,
    on(event, handler) { listeners[event] = handler; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalls = 0;
  guard({}, firstRes, () => { nextCalls += 1; });
  const secondRes = responseDouble();
  guard({}, secondRes, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(secondRes.statusCode, 503);
  assert.match(secondRes.body.error, /busy/i);
  listeners.finish();
  const thirdRes = responseDouble();
  guard({}, thirdRes, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
  assert.equal(thirdRes.statusCode, 200);
});
