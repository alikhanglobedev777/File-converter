const { isIP } = require('node:net');

// Render public web services sit behind Cloudflare and Render's proxy, so req.ip
// is a shared proxy IP. Cloudflare overwrites CF-Connecting-IP with the visitor
// address on Render's public ingress. Never trust client-supplied X-Forwarded-For.
function recoveryClientIp(req) {
  if (process.env.RENDER === 'true' && process.env.RENDER_SERVICE_TYPE === 'web') {
    const forwardedIp = req.headers?.['cf-connecting-ip'];
    if (typeof forwardedIp === 'string' && isIP(forwardedIp)) return forwardedIp;
  }
  // If the provider header is absent or invalid, fail closed to the existing
  // socket-based bucket rather than accept an untrusted client-controlled key.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Small, bounded in-memory IP limiter for password recovery.
function createAuthRateLimiter({ limit = 5, windowMs = 15 * 60 * 1000, clock = () => Date.now() } = {}) {
  const attempts = new Map();
  return function authRateLimiter(req, res, next) {
    const now = clock();
    if (attempts.size > 5000) {
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
      if (attempts.size > 5000) attempts.clear();
    }
    const key = recoveryClientIp(req);
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
module.exports = { createAuthRateLimiter, recoveryClientIp };
