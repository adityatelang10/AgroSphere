import { useRef, useState } from "react";

export default function MessageComposer({ onSend, onTyping, connected }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const attempt = useRef(null);
  const submit = async (event) => {
    event?.preventDefault();
    if (pending.current || !text.trim() || text.length > 2000 || !connected) return;
    pending.current = true; setSending(true); setError("");
    if (!attempt.current || attempt.current.text !== text.trim()) attempt.current = { text: text.trim(), clientMessageId: crypto.randomUUID() };
    try { await onSend(attempt.current); setText(""); attempt.current = null; onTyping(false); }
    catch (e) { setError(e.message || "Message not sent. Please try again."); }
    finally { pending.current = false; setSending(false); }
  };
  return <form className="chat-composer" onSubmit={submit}>
    {error ? <p className="chat-error" role="alert">{error}</p> : null}
    <label className="sr-only" htmlFor="chat-message">Type a message</label>
    <div className="chat-composer-row">
      <textarea id="chat-message" placeholder="Type a message…" rows={2} maxLength={2000} value={text} disabled={sending}
        onChange={(e) => { setText(e.target.value); onTyping(Boolean(e.target.value.trim())); }} onBlur={() => onTyping(false)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) { e.preventDefault(); submit(); } }} />
      <button className="chat-send" type="submit" disabled={!text.trim() || sending || !connected} aria-label="Send message">{sending ? "Sending…" : "Send"}<span aria-hidden="true"> ↗</span></button>
    </div>
    <p className="chat-composer-hint"><span>Enter to send · Shift + Enter for a new line</span><span>{text.length}/2000</span></p>
  </form>;
}
