// Small, bounded in-memory IP limiter for password recovery.
function createAuthRateLimiter({ limit = 5, windowMs = 15 * 60 * 1000, clock = () => Date.now() } = {}) {
  const attempts = new Map();
  return function authRateLimiter(req, res, next) {
    const now = clock();
    if (attempts.size > 5000) {
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
      if (attempts.size > 5000) attempts.clear();
    }
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const previous = attempts.get(key);
    const entry = previous && previous.until > now ? previous : { count: 0, until: now + windowMs };
    if (entry.count >= limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
      return res.status(429).json({ error: 'Too many password recovery attempts. Please try later.' });
    }
    entry.count += 1;
    attempts.set(key, entry);
    return next();
  };
}
module.exports = { createAuthRateLimiter };
