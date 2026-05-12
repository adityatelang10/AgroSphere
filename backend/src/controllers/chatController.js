const { body, validationResult } = require("express-validator");

const { generateGeminiReply } = require("../services/geminiService");

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
    .isArray({ min: 1, max: 40 })
    .withMessage("messages must be an array containing 1 to 40 items"),
  body("messages.*.role")
    .optional()
    .isString()
    .withMessage("Each message role must be a string"),
  body().custom((value) => {
    const hasQuestion =
      typeof value?.question === "string" && value.question.trim().length > 0;
    const hasMessages = Array.isArray(value?.messages) && value.messages.length > 0;

    if (!hasQuestion && !hasMessages) {
      throw new Error("Either question or messages is required");
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
    return next(error);
  }
};

module.exports = {
  geminiChatValidation,
  postGeminiChat,
};
