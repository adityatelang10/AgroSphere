const crypto = require("crypto");

const getPasswordResetLimits = (environment = process.env) => {
  // NODE_ENV is commonly unset when running this project's local npm dev command.
  // Only an explicitly local CLIENT_URL may use relaxed limits in that case.
  let localClient = false;
  try {
    const url = new URL(environment.CLIENT_URL || "http://localhost:5173");
    localClient = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { /* Invalid configuration keeps production-strength limits. */ }
  const development = environment.NODE_ENV === "development" || environment.NODE_ENV === "test" ||
    (!environment.NODE_ENV && localClient);
  return {
    forgotIp: { limit: development ? 30 : 10, windowMs: 15 * 60 * 1000 },
    forgotEmail: { limit: development ? 10 : 3, windowMs: (development ? 15 : 60) * 60 * 1000 },
    resetIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  };
};

// Bounded per-process limiter for the current single-Node deployment.
const createPasswordResetLimiter = ({ limit, windowMs, key = (req) => req.ip,
  now = Date.now, maxEntries = 10000, scope = "password-recovery", skipServerErrors = false } = {}) => {
  const entries = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [id, entry] of entries) {
      if (entry.expires <= time) entries.delete(id);
    }
    const id = crypto.createHash("sha256").update(String(key(req) || "unknown")).digest("hex");
    let entry = entries.get(id);
    if (!entry && entries.size < maxEntries) {
      entry = { count: 0, expires: time + windowMs };
      entries.set(id, entry);
    }
    const retryAfter = Math.max(1, Math.ceil(((entry?.expires || time + windowMs) - time) / 1000));
    res.set("Cache-Control", "no-store");
    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(Math.max(0, limit - (entry?.count || 0) - 1)));
    res.set("RateLimit-Reset", String(retryAfter));
    res.set("RateLimit-Policy", `${limit};w=${Math.ceil(windowMs / 1000)}`);
    res.set("X-RateLimit-Scope", scope);
    if (!entry || entry.count >= limit) {
      res.set("RateLimit-Remaining", "0");
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false,
        code: "PASSWORD_RECOVERY_RATE_LIMITED", limiter: scope, retryAfterSeconds: retryAfter,
        message: "Too many recovery attempts. Please wait before trying again." });
    }
    entry.count += 1;
    if (skipServerErrors) {
      res.once("finish", () => {
        if (res.statusCode >= 500) entry.count = Math.max(0, entry.count - 1);
      });
    }
    return next();
  };
};

module.exports = { createPasswordResetLimiter, getPasswordResetLimits };
