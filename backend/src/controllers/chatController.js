const { body, validationResult } = require("express-validator");

const { generateGeminiReply } = require("../services/geminiService");

const MAX_CONVERSATION_MESSAGES = 20;
const MAX_MESSAGE_CHARACTERS = 4000;
const MAX_TOTAL_CONVERSATION_CHARACTERS = 16000;

const handleValidation = (req, res) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return null;
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: errors.array(),
  });
};

const geminiChatValidation = [
  body("question")
    .optional()
    .isString()
    .withMessage("question must be a string")
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage("question must be between 1 and 4000 characters"),
  body("messages")
    .optional()
    .isArray({ min: 1, max: MAX_CONVERSATION_MESSAGES })
    .withMessage(
      `messages must be an array containing 1 to ${MAX_CONVERSATION_MESSAGES} items`
    ),
  body("messages.*.role")
    .exists()
    .withMessage("Each message requires a role")
    .bail()
    .isString()
    .withMessage("Each message role must be a string")
    .bail()
    .isIn(["user", "assistant"])
    .withMessage("Message role must be user or assistant"),
  body("messages.*.content")
    .exists()
    .withMessage("Each message requires content")
    .bail()
    .isString()
    .withMessage("Each message content must be a string")
    .bail()
    .trim()
    .isLength({ min: 1, max: MAX_MESSAGE_CHARACTERS })
    .withMessage(
      `Each message must be between 1 and ${MAX_MESSAGE_CHARACTERS} characters`
    ),
  body().custom((value) => {
    const hasQuestion =
      typeof value?.question === "string" && value.question.trim().length > 0;
    const hasMessages = Array.isArray(value?.messages) && value.messages.length > 0;

    if (!hasQuestion && !hasMessages) {
      throw new Error("Either question or messages is required");
    }

    if (hasMessages && value.messages.at(-1)?.role !== "user") {
      throw new Error("The final conversation message must have the user role");
    }

    const totalCharacters =
      (hasQuestion ? value.question.trim().length : 0) +
      (hasMessages
        ? value.messages.reduce(
            (total, message) =>
              total +
              (typeof message?.content === "string"
                ? message.content.trim().length
                : 0),
            0
          )
        : 0);

    if (totalCharacters > MAX_TOTAL_CONVERSATION_CHARACTERS) {
      throw new Error(
        `Conversation content must not exceed ${MAX_TOTAL_CONVERSATION_CHARACTERS} characters`
      );
    }

    return true;
  }),
];

const postGeminiChat = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const result = await generateGeminiReply({
      messages: req.body.messages,
      question: req.body.question,
    });

    return res.status(200).json({
      success: true,
      reply: result.text,
      model: result.model,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return next(error);
    }

    console.error("Gemini request failed.", {
      name: error.name || "GeminiProviderError",
      status: error.status || error.code || error.statusCode || "unknown",
    });
    return res.status(503).json({
      success: false,
      message:
        "AgroSphere Copilot is temporarily unavailable. Please try again later.",
    });
  }
};

module.exports = {
  geminiChatValidation,
  postGeminiChat,
};
