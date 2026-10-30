const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthRateLimiter, recoveryClientIp } = require('../middleware/auth-rate-limit');

function withRenderEnvironment(callback) {
  const before = { render: process.env.RENDER, type: process.env.RENDER_SERVICE_TYPE };
  process.env.RENDER = 'true';
  process.env.RENDER_SERVICE_TYPE = 'web';
  try { callback(); } finally {
    for (const [name, value] of [['RENDER', before.render], ['RENDER_SERVICE_TYPE', before.type]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function response() {
  return {
    headers: {}, statusCode: 200, body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function invoke(limiter, req) {
  const res = response();
  let passed = false;
  limiter(req, res, () => { passed = true; });
  return { res, passed };
}

test('different visitors behind the same Render proxy get independent recovery buckets', () => {
  withRenderEnvironment(() => {
    const limiter = createAuthRateLimiter({ limit: 2 });
    const request = (visitor) => ({ ip: '10.0.0.2', headers: { 'cf-connecting-ip': visitor } });
    assert.equal(invoke(limiter, request('198.51.100.10')).passed, true);
    assert.equal(invoke(limiter, request('198.51.100.10')).passed, true);
    const blocked = invoke(limiter, request('198.51.100.10'));
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.headers['Retry-After'], '900');
    assert.equal(invoke(limiter, request('203.0.113.20')).passed, true);
    assert.equal(invoke(limiter, request('2001:db8::20')).passed, true);
  });
});

test('spoofing X-Forwarded-For cannot evade a Render recovery limit', () => {
  withRenderEnvironment(() => {
    const limiter = createAuthRateLimiter({ limit: 1 });
    const req = (spoofed) => ({ ip: '10.0.0.2', headers: {
      'cf-connecting-ip': '198.51.100.10', 'x-forwarded-for': spoofed,
    } });
    assert.equal(invoke(limiter, req('1.1.1.1')).passed, true);
    assert.equal(invoke(limiter, req('8.8.8.8')).res.statusCode, 429);
  });
});

test('missing or invalid Render client headers use the shared proxy IP, not a forged address', () => {
  withRenderEnvironment(() => {
    const limiter = createAuthRateLimiter({ limit: 1 });
    assert.equal(invoke(limiter, { ip: '10.0.0.2', headers: {
      'cf-connecting-ip': 'invalid-ip', 'x-forwarded-for': '1.1.1.1',
    } }).passed, true);
    assert.equal(invoke(limiter, { ip: '10.0.0.2', headers: {
      'x-forwarded-for': '8.8.8.8',
    } }).res.statusCode, 429);
    assert.equal(recoveryClientIp({ ip: '10.0.0.2', headers: {
      'cf-connecting-ip': '1.2.3.4, 5.6.7.8',
    } }), '10.0.0.2');
  });
});

test('outside Render, an arbitrary CF-Connecting-IP header is not trusted', () => {
  const before = process.env.RENDER;
  delete process.env.RENDER;
  try {
    const limiter = createAuthRateLimiter({ limit: 1 });
    const req = (spoofed) => ({ ip: '127.0.0.1', headers: { 'cf-connecting-ip': spoofed } });
    assert.equal(invoke(limiter, req('198.51.100.10')).passed, true);
    assert.equal(invoke(limiter, req('203.0.113.20')).res.statusCode, 429);
  } finally {
    if (before === undefined) delete process.env.RENDER;
    else process.env.RENDER = before;
  }
});

test('recovery cooldown expires normally and Retry-After reflects the remaining window', () => {
  withRenderEnvironment(() => {
    let now = 1000;
    const limiter = createAuthRateLimiter({ limit: 1, windowMs: 60_000, clock: () => now });
    const req = { ip: '10.0.0.2', headers: { 'cf-connecting-ip': '198.51.100.10' } };
    assert.equal(invoke(limiter, req).passed, true);
    now += 20_000;
    const blocked = invoke(limiter, req);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.headers['Retry-After'], '40');
    now += 40_000;
    assert.equal(invoke(limiter, req).passed, true);
  });
});
