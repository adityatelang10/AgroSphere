import { startTransition, useEffect, useRef, useState } from "react";

import { apiRequest } from "../services/apiClient";

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Namaste! I am AgroSphere Assistant. I can help with agriculture questions and guide you around AgroSphere.",
};

const createMessage = (role, content) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  content,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
});

const renderMessageContent = (content) => {
  if (!content) return null;
  const blocks = content.split(/\n\n+/);
  return blocks.map((block, bIdx) => {
    const lines = block.split('\n');
    const isList = lines.some(line => /^(\s*[-*]|\s*\d+\.)\s+/.test(line));
    
    if (isList) {
      return (
        <ul key={bIdx} className="list-inside list-disc space-y-1.5 mb-3 last:mb-0 ml-1">
          {lines.map((line, lIdx) => {
            const cleanLine = line.replace(/^(\s*[-*]|\s*\d+\.)\s+/, '');
            const parts = cleanLine.split(/(\*\*.*?\*\*)/).map((part, i) => 
              part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part
            );
            return <li key={lIdx}>{parts}</li>;
          })}
        </ul>
      );
    }

    const parts = block.split(/(\*\*.*?\*\*)/).map((part, i) => 
      part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part
    );
    return <p key={bIdx} className="mb-3 last:mb-0">{parts}</p>;
  });
};

export default function GeminiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen, isLoading]);

  const sendMessage = async () => {
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    const userMessage = createMessage("user", trimmed);
    const requestMessages = [...messages, userMessage]
      .filter((message) => message.id !== WELCOME_MESSAGE.id)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setInput("");
    setError("");
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
        setMessages((currentMessages) => [...currentMessages, assistantMessage]);
      });
    } catch (requestError) {
      const fallbackMessage =
        requestError instanceof Error
          ? requestError.message
          : "Unable to contact AgroSphere Assistant.";

      setError(fallbackMessage);

      startTransition(() => {
        setMessages((currentMessages) => [
          ...currentMessages,
          createMessage(
            "assistant",
            "I could not respond right now. Please try again in a moment."
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

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-2xl shadow-emerald-900/15 dark:border-emerald-900/60 dark:bg-slate-950">
          <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-5 py-4 text-white">
            <div>
              <p className="text-base font-semibold tracking-wide">AgroSphere Assistant</p>
              <p className="text-xs text-emerald-100 mt-0.5">
                Agriculture support and platform guidance
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30"
              aria-label="Close chat"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="h-[26rem] space-y-4 overflow-y-auto bg-slate-50 px-5 py-5 dark:bg-slate-900">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white rounded-br-sm"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 rounded-bl-sm"
                  }`}
                >
                  {renderMessageContent(message.content)}
                </div>
                {message.timestamp && (
                  <span className="text-[11px] text-slate-400 mt-1 px-1">
                    {message.timestamp}
                  </span>
                )}
              </div>
            ))}

            {isLoading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white px-5 py-3.5 text-[15px] text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </span>
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <label htmlFor="gemini-chat-input" className="sr-only">
              Ask AgroSphere Assistant
            </label>
            <textarea
              id="gemini-chat-input"
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about crops, orders, listings, or farming support..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900/70"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-h-[1.25rem] text-xs text-rose-600 dark:text-rose-400">
                {error}
              </p>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
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
          aria-label="Open AgroSphere Assistant"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-2">
            <path
              d="M8 10h8M8 14h5m-8 6l1.8-3.6A8 8 0 1 1 20 12a8 8 0 0 1-8 8H5Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
