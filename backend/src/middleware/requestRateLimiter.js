const { createPasswordResetLimiter } = require("./passwordResetLimiter");

// Reuse the bounded, hashed-key store and headers already used by recovery.
// Stores are independent for each middleware; no new dependency is needed.
const createRequestLimiter = (options) => createPasswordResetLimiter({
  code: "REQUEST_RATE_LIMITED",
  message: "Too many requests. Please wait before trying again.",
  ...options,
});

const getRequestLimits = (environment = process.env) => {
  // Unknown environments retain production limits, even with a localhost URL.
  const development = ["development", "test"].includes(environment.NODE_ENV);
  return {
    loginIp: { limit: development ? 100 : 30, windowMs: 15 * 60 * 1000 },
    loginEmail: { limit: development ? 30 : 10, windowMs: 15 * 60 * 1000 },
    registerIp: { limit: development ? 20 : 5, windowMs: 60 * 60 * 1000 },
    geminiIp: { limit: development ? 30 : 10, windowMs: 5 * 60 * 1000 },
    geminiGlobal: { limit: development ? 500 : 200, windowMs: 15 * 60 * 1000 },
  };
};

module.exports = { createRequestLimiter, getRequestLimits };
