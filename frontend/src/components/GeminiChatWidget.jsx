import { startTransition, useEffect, useRef, useState } from "react";

import { apiRequest } from "../services/apiClient";
import {
  VOICE_LANGUAGE_OPTIONS,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
} from "../utils/speechAssistant";

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Namaste! I am AgroSphere Copilot. Ask me about farming or how to use AgroSphere's marketplace, Crop Advisor, Leaf Scanner, Irrigation Advisor, weather, Farm Decision, QR traceability, or Test Mode checkout.",
};

const SUGGESTED_QUESTIONS = [
  "How do I use Crop Advisor?",
  "Where can I check current weather?",
  "What is the Farm Decision Engine?",
  "How does QR crop traceability work?",
];

const MAX_REQUEST_MESSAGES = 20;

const createMessage = (role, content) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

const renderMessageContent = (content) => {
  if (!content) return null;
  const blocks = content.split(/\n\n+/);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n");
    const isList = lines.some((line) => /^(\s*[-*]|\s*\d+\.)\s+/.test(line));

    if (isList) {
      return (
        <ul
          key={blockIndex}
          className="mb-3 ml-1 list-inside list-disc space-y-1.5 last:mb-0"
        >
          {lines.map((line, lineIndex) => {
            const cleanLine = line.replace(/^(\s*[-*]|\s*\d+\.)\s+/, "");
            const parts = cleanLine.split(/(\*\*.*?\*\*)/).map((part, index) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={index} className="font-semibold">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                part
              )
            );

            return <li key={lineIndex}>{parts}</li>;
          })}
        </ul>
      );
    }

    const parts = block.split(/(\*\*.*?\*\*)/).map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      )
    );

    return (
      <p key={blockIndex} className="mb-3 last:mb-0">
        {parts}
      </p>
    );
  });
};

const MicrophoneIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" strokeLinecap="round" />
  </svg>
);

export default function GeminiChatWidget() {
  const browserWindow = typeof window === "undefined" ? null : window;
  const recognitionSupported = isSpeechRecognitionSupported(browserWindow);
  const speechOutputSupported = isSpeechSynthesisSupported(browserWindow);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [error, setError] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const cancelledSpeechIdRef = useRef(null);

  const selectedLanguage =
    VOICE_LANGUAGE_OPTIONS.find((option) => option.value === voiceLanguage) ||
    VOICE_LANGUAGE_OPTIONS[0];

  const cancelSpeech = (showStatus = false) => {
    cancelledSpeechIdRef.current = speakingMessageId;
    stopSpeaking(browserWindow);
    setSpeakingMessageId(null);
    if (showStatus) {
      setVoiceStatus("Stopped reading response.");
    }
  };

  const cancelRecognition = (useAbort = true) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    recognitionRef.current = null;
    if (useAbort && typeof recognition.abort === "function") {
      recognition.abort();
    } else if (typeof recognition.stop === "function") {
      recognition.stop();
    }
    setIsListening(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen, isLoading]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort?.();
      stopSpeaking(browserWindow);
    },
    [browserWindow]
  );

  const readAssistantMessage = (message) => {
    cancelledSpeechIdRef.current = null;
    setSpeakingMessageId(message.id);
    setVoiceStatus(`Starting ${selectedLanguage.label} read aloud...`);

    const result = speakText({
      browserWindow,
      text: message.content,
      language: selectedLanguage.value,
      languageLabel: selectedLanguage.label,
      onStart: () => {
        if (cancelledSpeechIdRef.current === message.id) {
          return;
        }
        setSpeakingMessageId(message.id);
        setVoiceStatus(`Reading response in ${selectedLanguage.label}.`);
      },
      onEnd: () => {
        if (cancelledSpeechIdRef.current === message.id) {
          return;
        }
        setSpeakingMessageId(null);
        setVoiceStatus("Finished reading response.");
      },
      onError: (messageText) => {
        if (cancelledSpeechIdRef.current === message.id) {
          return;
        }
        setSpeakingMessageId(null);
        setVoiceStatus(messageText);
      },
    });

    if (!result.success) {
      setSpeakingMessageId(null);
      setVoiceStatus(result.message);
    }
  };

  const startListening = () => {
    if (isListening) {
      cancelRecognition(false);
      setVoiceStatus("Voice input stopped. You can edit the transcript or type.");
      return;
    }

    cancelSpeech();
    setError("");

    if (!recognitionSupported) {
      setVoiceStatus(
        "Voice input is not supported in this browser. You can continue typing."
      );
      return;
    }

    let receivedTranscript = false;
    let recognitionFailed = false;
    const recognition = createSpeechRecognition({
      browserWindow,
      language: selectedLanguage.value,
      onStart: () => {
        setIsListening(true);
        setVoiceStatus(`Listening in ${selectedLanguage.label}...`);
      },
      onTranscript: (transcript) => {
        receivedTranscript = true;
        setInput((currentInput) =>
          currentInput.trim() ? `${currentInput.trim()} ${transcript}` : transcript
        );
        setVoiceStatus("Transcript ready. Review or edit it, then press Send.");
      },
      onError: (messageText) => {
        recognitionFailed = true;
        setVoiceStatus(messageText);
      },
      onEnd: () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        setIsListening(false);
        if (!receivedTranscript && !recognitionFailed) {
          setVoiceStatus(
            "No speech was detected. Please try again or type your question."
          );
        }
      },
    });

    if (!recognition) {
      setVoiceStatus(
        "Voice input is not supported in this browser. You can continue typing."
      );
      return;
    }

    recognitionRef.current = recognition;
    setIsListening(true);
    setVoiceStatus(`Starting ${selectedLanguage.label} voice input...`);

    try {
      recognition.start();
    } catch (recognitionError) {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceStatus(
        "Voice input could not start. Please try again or type your question."
      );
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    cancelSpeech();
    cancelRecognition();

    const userMessage = createMessage("user", trimmed);
    const requestMessages = [...messages, userMessage]
      .filter((message) => message.id !== WELCOME_MESSAGE.id)
      .slice(-MAX_REQUEST_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setInput("");
    setError("");
    setVoiceStatus("");
    setIsLoading(true);
    setMessages((currentMessages) => [...currentMessages, userMessage]);

    try {
      const data = await apiRequest("/api/chat/gemini", {
        method: "POST",
        body: {
          messages: requestMessages,
        },
      });

      const assistantMessage = createMessage("assistant", data.reply);

      startTransition(() => {
        setMessages((currentMessages) => [
          ...currentMessages,
          assistantMessage,
        ]);
      });

      if (autoSpeak) {
        browserWindow.setTimeout(
          () => readAssistantMessage(assistantMessage),
          0
        );
      }
    } catch (requestError) {
      const fallbackMessage =
        requestError instanceof Error
          ? requestError.message
          : "Unable to contact AgroSphere Copilot.";

      setError(fallbackMessage);

      startTransition(() => {
        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage(
            "assistant",
            "I could not respond right now. You can continue using the rest of AgroSphere and try Copilot again in a moment."
          ),
        ]);
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendMessage();
  };

  const handleKeyDown = async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  };

  const handleClose = () => {
    cancelRecognition();
    cancelSpeech();
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-2xl shadow-emerald-900/15 dark:border-emerald-900/60 dark:bg-slate-950">
          <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-5 py-4 text-white">
            <div>
              <p className="text-base font-semibold tracking-wide">
                AgroSphere Copilot
              </p>
              <p className="mt-0.5 text-xs text-emerald-100">
                Farming guidance and current feature help
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30"
              aria-label="Close chat"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-none stroke-current stroke-2"
              >
                <path
                  d="M6 6l12 12M18 6 6 18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="h-[24rem] space-y-4 overflow-y-auto bg-slate-50 px-5 py-5 dark:bg-slate-900">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "rounded-br-sm bg-emerald-600 text-white"
                      : "rounded-bl-sm bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                  }`}
                >
                  {renderMessageContent(message.content)}
                </div>

                {message.role === "assistant" && speechOutputSupported ? (
                  <button
                    type="button"
                    onClick={() =>
                      speakingMessageId === message.id
                        ? cancelSpeech(true)
                        : readAssistantMessage(message)
                    }
                    className="mt-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-950"
                  >
                    {speakingMessageId === message.id ? "Stop" : "Read aloud"}
                  </button>
                ) : null}

                {message.timestamp ? (
                  <span className="mt-1 px-1 text-[11px] text-slate-400">
                    {message.timestamp}
                  </span>
                ) : null}
              </div>
            ))}

            {messages.length === 1 ? (
              <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => setInput(question)}
                    className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-slate-800 dark:text-emerald-200 dark:hover:bg-emerald-950"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}

            {isLoading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white px-5 py-3.5 text-[15px] text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                  <span className="flex gap-1" aria-label="Copilot is responding">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startListening}
                disabled={!recognitionSupported}
                aria-pressed={isListening}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isListening
                    ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:border-slate-800 dark:disabled:bg-slate-900`}
              >
                <MicrophoneIcon />
                {recognitionSupported
                  ? isListening
                    ? "Stop listening"
                    : "Speak"
                  : "Voice unsupported"}
              </button>

              <label className="sr-only" htmlFor="copilot-voice-language">
                Voice language
              </label>
              <select
                id="copilot-voice-language"
                value={voiceLanguage}
                onChange={(event) => {
                  cancelSpeech();
                  setVoiceLanguage(event.target.value);
                  setVoiceStatus("");
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {VOICE_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  disabled={!speechOutputSupported}
                  onChange={(event) => setAutoSpeak(event.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Auto-read
              </label>
            </div>

            <label htmlFor="gemini-chat-input" className="sr-only">
              Ask AgroSphere Copilot
            </label>
            <textarea
              id="gemini-chat-input"
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about farming or an AgroSphere feature..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900/70"
            />

            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p
                  aria-live="polite"
                  className={`min-h-[1rem] text-xs ${
                    isListening
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {voiceStatus ||
                    (!recognitionSupported
                      ? "Voice input is unavailable; typed chat still works."
                      : "Voice availability depends on your browser and installed languages.")}
                </p>
                <p className="min-h-[1rem] text-xs text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              </div>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="inline-flex shrink-0 items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 via-lime-500 to-amber-400 text-slate-950 shadow-xl shadow-emerald-900/20 transition hover:scale-105"
          aria-label="Open AgroSphere Copilot"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-2">
            <path
              d="M8 10h8M8 14h5m-8 6 1.8-3.6A8 8 0 1 1 20 12a8 8 0 0 1-8 8H5Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
