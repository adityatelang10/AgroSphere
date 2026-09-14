const {
  AGROSPHERE_COPILOT_SYSTEM_INSTRUCTION,
} = require("../config/agroSphereCopilotContext");

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_CONVERSATION_MESSAGES = 20;
const MAX_MESSAGE_CHARACTERS = 4000;

let cachedClientPromise;

const getGeminiModelName = () => process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

const getGeminiApiKey = () => {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is missing from environment variables.");
    error.statusCode = 500;
    throw error;
  }

  return apiKey;
};

const getGeminiClient = async () => {
  if (!cachedClientPromise) {
    cachedClientPromise = import("@google/genai").then(({ GoogleGenAI }) => {
      return new GoogleGenAI({
        apiKey: getGeminiApiKey(),
      });
    });
  }

  return cachedClientPromise;
};

const normalizeMessageRole = (role) => {
  if (!role) {
    return null;
  }

  const normalizedRole = String(role).trim().toLowerCase();

  if (normalizedRole === "assistant" || normalizedRole === "model" || normalizedRole === "bot") {
    return "model";
  }

  if (normalizedRole === "user") {
    return "user";
  }

  return null;
};

const extractTextFromMessage = (message) => {
  if (typeof message?.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  if (typeof message?.text === "string" && message.text.trim()) {
    return message.text.trim();
  }

  if (Array.isArray(message?.parts)) {
    const text = message.parts
      .map((part) => {
        if (typeof part === "string") {
          return part.trim();
        }

        if (typeof part?.text === "string") {
          return part.text.trim();
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");

    if (text) {
      return text;
    }
  }

  return "";
};

const normalizeConversationInput = ({ messages, question }) => {
  if (Array.isArray(messages) && messages.length > 0) {
    const contents = messages
      .slice(-MAX_CONVERSATION_MESSAGES)
      .map((message) => {
        const role = normalizeMessageRole(message.role);
        const text = extractTextFromMessage(message).slice(
          0,
          MAX_MESSAGE_CHARACTERS
        );

        if (!role || !text) {
          return null;
        }

        return {
          role,
          parts: [{ text }],
        };
      })
      .filter(Boolean);

    return {
      contents,
    };
  }

  return {
    contents: [
      {
        role: "user",
        parts: [{ text: String(question).trim() }],
      },
    ],
  };
};

const buildGeminiRequest = ({ messages, question }) => {
  const { contents } = normalizeConversationInput({ messages, question });

  if (!contents.length) {
    const error = new Error("At least one valid user message is required.");
    error.statusCode = 400;
    throw error;
  }

  return {
    model: getGeminiModelName(),
    contents,
    config: {
      systemInstruction: AGROSPHERE_COPILOT_SYSTEM_INSTRUCTION,
      temperature: 0.4,
    },
  };
};

const extractResponseText = (response) => {
  if (typeof response?.text === "string" && response.text.trim()) {
    return response.text.trim();
  }

  const parts = response?.candidates?.[0]?.content?.parts;

  if (Array.isArray(parts)) {
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  const error = new Error("Gemini did not return a text response.");
  error.statusCode = 502;
  throw error;
};

const generateGeminiReply = async ({ messages, question }) => {
  const client = await getGeminiClient();
  const request = buildGeminiRequest({ messages, question });
  const response = await client.models.generateContent(request);

  return {
    text: extractResponseText(response),
    model: getGeminiModelName(),
  };
};

module.exports = {
  DEFAULT_GEMINI_MODEL,
  MAX_CONVERSATION_MESSAGES,
  buildGeminiRequest,
  generateGeminiReply,
  getGeminiModelName,
  normalizeConversationInput,
};
