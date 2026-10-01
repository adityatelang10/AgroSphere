const express = require("express");

const {
  geminiChatValidation,
  postGeminiChat,
} = require("../controllers/chatController");
const { createRequestLimiter, getRequestLimits } = require("../middleware/requestRateLimiter");

const router = express.Router();
const limits = getRequestLimits();

// Public Copilot remains available; both quotas run before provider calls.
router.post("/gemini",
  createRequestLimiter({ ...limits.geminiIp, scope: "gemini-ip" }),
  geminiChatValidation,
  createRequestLimiter({ ...limits.geminiGlobal, scope: "gemini-global", key: () => "global" }),
  postGeminiChat);

module.exports = router;
