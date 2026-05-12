const express = require("express");

const {
  geminiChatValidation,
  postGeminiChat,
} = require("../controllers/chatController");

const router = express.Router();

router.post("/gemini", geminiChatValidation, postGeminiChat);

module.exports = router;
