function parsePositiveEnv(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createRateLimiter({ windowMs = 10 * 60 * 1000, limit = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const record = hits.get(key);
    if (!record || now - record.startedAt >= windowMs) {
      hits.set(key, { count: 1, startedAt: now });
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(limit - 1));
      return next();
    }
    if (record.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - record.startedAt)) / 1000));
      res.set('Retry-After', String(retryAfter));
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'Too many conversion requests. Please wait and try again.' });
    }
    record.count += 1;
    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(limit - record.count));
    return next();
  };
}

function createConcurrencyLimiter({ limit = 2 } = {}) {
  let active = 0;
  return (req, res, next) => {
    if (active >= limit) {
      return res.status(503).json({ error: 'The converter is busy right now. Please retry in a moment.' });
    }
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
    };
    res.on('finish', release);
    res.on('close', release);
    res.on('error', release);
    next();
  };
}

function conversionTimeout(timeoutMs = 90_000) {
  return (req, res, next) => {
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'The conversion took too long and timed out. Please try a smaller file.' });
      }
      res.end();
    });
    next();
  };
}

function buildConversionGuardFromEnv() {
  const windowMs = parsePositiveEnv(process.env.CONVERT_RATE_WINDOW_MS, 10 * 60 * 1000);
  const rateLimit = parsePositiveEnv(process.env.CONVERT_RATE_LIMIT, 30);
  const concurrency = parsePositiveEnv(process.env.CONVERT_CONCURRENCY_LIMIT, 2);
  const timeoutMs = parsePositiveEnv(process.env.CONVERT_TIMEOUT_MS, 90_000);
  return [createRateLimiter({ windowMs, limit: rateLimit }), createConcurrencyLimiter({ limit: concurrency }), conversionTimeout(timeoutMs)];
}

module.exports = { createRateLimiter, createConcurrencyLimiter, conversionTimeout, buildConversionGuardFromEnv };
