import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { getMessages, markConversationRead, socketRequest } from "../../services/conversationService";
import { chatDay, chatTime, counterpart, mergeMessages } from "../../utils/conversations";
import { formatCurrency } from "../../utils/formatters";
import MessageComposer from "../../components/messages/MessageComposer";
import "../../styles/messages.css";

function Avatar({ person }) {
  return <span className="chat-avatar" aria-hidden="true">{person?.imageUrl ? <img src={person.imageUrl} alt="" /> : (person?.name || "?").slice(0, 1).toUpperCase()}</span>;
}
function EmptyState({ role }) {
  return <div className="chat-empty">
    <span className="chat-empty-mark" aria-hidden="true">↗</span>
    <h2>Your conversations will grow here.</h2>
    <p>{role === "CUSTOMER" ? "Message a farmer from a crop or farmer profile to start a conversation." : "When a customer contacts your farm, you can read and reply here."}</p>
    <Link to="/marketplace">Explore marketplace →</Link>
  </div>;
}

function ConversationPane({ id, onBack }) {
  const { user } = useAuth();
  const { socket, connected, refresh, conversations } = useChat();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [earlierLoading, setEarlierLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  const log = useRef(null);
  const stick = useRef(true);
  const readCursor = useRef("");
  const typingTimer = useRef(null);
  const lastTyping = useRef(0);
  const request = useRef(0);
  const live = useRef(true);

  const load = useCallback(async () => {
    const serial = ++request.current;
    try {
      // Join before fetching so no message can fall into the subscription/history gap.
      if (socket?.connected) await socketRequest(socket, "conversation:join", { conversationId: id });
      const result = await getMessages(id);
      if (!live.current || serial !== request.current) return;
      setConversation(result.conversation); setMessages((old) => mergeMessages(old, result.messages));
      setHasMore(result.hasMore); setError("");
    } catch (e) { if (live.current && serial === request.current) setError(e.message); }
    finally { if (live.current && serial === request.current) setLoading(false); }
  }, [id, socket]);

  useEffect(() => {
    live.current = true;
    const onMessage = (m) => { if (m.conversation === id) { setMessages((old) => mergeMessages(old, [m])); setTyping(false); } };
    const onRead = (receipt) => {
      if (receipt.conversationId !== id) return;
      setMessages((old) => old.map((m) => m.sender !== receipt.readerId && m._id <= receipt.throughMessageId ? { ...m, readAt: m.readAt || receipt.readAt } : m));
    };
    const onTyping = (event) => {
      if (event.conversationId !== id || event.userId === user.id) return;
      clearTimeout(typingTimer.current); setTyping(event.typing);
      typingTimer.current = setTimeout(() => setTyping(false), 2500);
    };
    const onVisible = () => {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (isVisible) { readCursor.current = ""; load(); }
    };
    socket?.on("message:new", onMessage); socket?.on("conversation:read", onRead);
    socket?.on("conversation:typing", onTyping); socket?.on("connect", load);
    document.addEventListener("visibilitychange", onVisible);
    load();
    return () => {
      live.current = false; request.current += 1;
      clearTimeout(typingTimer.current);
      socket?.off("message:new", onMessage); socket?.off("conversation:read", onRead);
      socket?.off("conversation:typing", onTyping); socket?.off("connect", load);
      document.removeEventListener("visibilitychange", onVisible);
      if (socket?.connected) {
        socket.emit("conversation:typing", { conversationId: id, typing: false }, () => {});
        socket.emit("conversation:leave", { conversationId: id }, () => {});
      }
    };
  }, [id, socket, load, user.id]);

  const lastId = messages.at(-1)?._id;
  useEffect(() => {
    if (stick.current && log.current) { log.current.scrollTop = log.current.scrollHeight; setAtBottom(true); }
  }, [lastId, loading]);

  useEffect(() => {
    if (loading || !visible || !atBottom || !lastId || readCursor.current === lastId) return;
    if (!messages.some((m) => m.sender !== user.id && !m.readAt)) return;
    readCursor.current = lastId;
    markConversationRead(id, lastId).then((receipt) => {
      if (!live.current) return;
      setMessages((old) => old.map((m) => m.sender !== user.id && m._id <= receipt.throughMessageId ? { ...m, readAt: m.readAt || receipt.readAt } : m));
      refresh();
    }).catch(() => { readCursor.current = ""; if (live.current) setError("Could not update read status. Reopen the conversation to retry."); });
  }, [id, lastId, loading, visible, atBottom, messages, user.id, refresh]);

  const earlier = async () => {
    if (earlierLoading || !messages.length) return;
    setEarlierLoading(true);
    const height = log.current?.scrollHeight || 0;
    try {
      const result = await getMessages(id, messages[0]._id);
      if (!live.current) return;
      stick.current = false;
      setMessages((old) => mergeMessages(old, result.messages)); setHasMore(result.hasMore);
      requestAnimationFrame(() => { if (log.current) log.current.scrollTop += log.current.scrollHeight - height; });
    } catch (e) { if (live.current) setError(e.message); }
    finally { if (live.current) setEarlierLoading(false); }
  };
  const send = async (payload) => {
    const response = await socketRequest(socket, "message:send", { conversationId: id, ...payload });
    if (live.current) { stick.current = true; setAtBottom(true); setMessages((old) => mergeMessages(old, [response.message])); refresh(); }
  };
  const sendTyping = (value) => {
    if (!socket?.connected || (value && Date.now() - lastTyping.current < 1200)) return;
    lastTyping.current = Date.now();
    socket.emit("conversation:typing", { conversationId: id, typing: value }, () => {});
  };
  const current = conversations.find((c) => c._id === id) || conversation;
  const other = current ? counterpart(current, user.role) : { name: "Conversation" };
  const crop = current?.cropContext;
  return <section className="chat-pane" aria-label="Open conversation">
    <header className="chat-pane-header">
      <button type="button" className="chat-back chat-quiet" onClick={onBack} aria-label="Back to conversations">←</button>
      <Avatar person={other} /><div className="chat-identity"><h2>{other.name}</h2><p>{other.farmName || (user.role === "FARMER" ? "Customer" : "Farmer")}</p></div>
      <span className={`chat-connection${connected ? "" : " is-offline"}`} role="status">{connected ? "Connected" : "Reconnecting…"}</span>
    </header>
    {crop ? <div className="chat-crop">
      {crop.imageUrl ? <img src={crop.imageUrl} alt={crop.name} /> : null}
      <div><strong>{crop.name}</strong><p>{formatCurrency(crop.price)} / {crop.unit} · {current.farmer?.name}</p></div>
      {crop.removed ? <span>Listing removed</span> : <Link to={`/crop/${crop._id}`}>View crop →</Link>}
    </div> : null}
    {error ? <div className="chat-error" role="alert">{error} <button type="button" onClick={load}>Retry</button></div> : null}
    <div className="chat-log" ref={log} role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text" onScroll={() => {
      const el = log.current; const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      stick.current = bottom; setAtBottom((old) => old === bottom ? old : bottom);
    }}>
      {loading ? <p className="chat-status" role="status">Loading conversation…</p> : null}
      {hasMore ? <button type="button" className="chat-earlier chat-quiet" disabled={earlierLoading} onClick={earlier}>{earlierLoading ? "Loading…" : "Load earlier messages"}</button> : null}
      {!loading && !messages.length && current ? <p className="chat-status">Start with a hello. Ask about availability, harvest or your crop needs.</p> : null}
      {messages.map((message, i) => {
        const own = message.sender === user.id;
        const day = chatDay(message.createdAt);
        const newDay = !i || day !== chatDay(messages[i - 1].createdAt);
        const grouped = !newDay && messages[i - 1]?.sender === message.sender;
        return <Fragment key={message._id}>
          {newDay ? <div className="chat-date"><span>{day}</span></div> : null}
          <div className={`chat-message${own ? " is-own" : ""}${grouped ? " is-grouped" : ""}`} aria-label={own ? "Sent message" : "Received message"}>
            <p>{message.text}</p><span className="chat-message-meta"><time dateTime={message.createdAt}>{chatTime(message.createdAt)}</time>{own ? <span>{message.readAt ? "Read" : "Sent"}</span> : null}</span>
          </div>
        </Fragment>;
      })}
    </div>
    {!atBottom ? <button className="chat-latest chat-quiet" onClick={() => { stick.current = true; setAtBottom(true); log.current.scrollTop = log.current.scrollHeight; }}>Latest messages ↓</button> : null}
    <div className="chat-typing" role="status">{typing && connected ? `${other.name} is typing…` : ""}</div>
    {current && !loading ? <MessageComposer onSend={send} onTyping={sendTyping} connected={connected} /> : null}
  </section>;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const chat = useChat();
  const [params, setParams] = useSearchParams();
  const selected = params.get("conversation");
  const [search, setSearch] = useState("");
  const root = useRef(null);
  useEffect(() => {
    // VisualViewport responds to the mobile keyboard without trapping document scrolling.
    const resize = () => { if (root.current) root.current.style.setProperty("--chat-height", `${Math.max(260, (window.visualViewport?.height || window.innerHeight) - Math.max(0, root.current.getBoundingClientRect().top) - 16)}px`); };
    resize(); window.addEventListener("resize", resize); window.visualViewport?.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, []);
  const filtered = chat.conversations.filter((c) => {
    const person = counterpart(c, user.role);
    return `${person.name} ${person.farmName || ""}`.toLowerCase().includes(search.toLowerCase());
  });
  return <div className={`chat-workspace${selected ? " has-selection" : ""}`} ref={root}>
    <aside className="chat-sidebar" aria-label="Conversations">
      <header className="chat-sidebar-header"><span className="chat-eyebrow">FIELD NOTES, REAL CONNECTIONS</span><h1>Messages <span>{chat.unreadCount > 0 ? chat.unreadCount : ""}</span></h1>
        <p>A direct conversation with your farming community.</p>
        <label className="chat-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search conversations" placeholder="Find a conversation" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </header>
      {chat.error ? <p className="chat-error" role="alert">{chat.error} <button onClick={chat.refresh}>Retry</button></p> : null}
      <div className="chat-conversations">
        {chat.loading && !chat.conversations.length ? <p className="chat-status" role="status">Loading conversations…</p> : null}
        {!chat.loading && !chat.error && !chat.conversations.length ? <EmptyState role={user.role} /> : null}
        {chat.conversations.length > 0 && !filtered.length ? <p className="chat-status">No matching conversations.</p> : null}
        {filtered.map((c) => {
          const person = counterpart(c, user.role);
          return <button key={c._id} type="button" className={`chat-conversation${selected === c._id ? " is-selected" : ""}`} aria-current={selected === c._id ? "true" : undefined} onClick={() => setParams({ conversation: c._id })}>
            <Avatar person={person} /><span className="chat-preview"><strong>{person.name}</strong>{person.farmName ? <small>{person.farmName}</small> : null}<span>{c.lastMessage || (c.cropContext ? `About ${c.cropContext.name}` : "Say hello")}</span></span>
            <span className="chat-list-meta"><time>{chatTime(c.lastMessageAt)}</time>{c.unreadCount > 0 ? <span className="chat-unread" aria-label={`${c.unreadCount} unread messages`}>{c.unreadCount}</span> : null}</span>
          </button>;
        })}
        {chat.hasMore ? <button type="button" className="chat-earlier chat-quiet" onClick={chat.loadMore} disabled={chat.loading}>Load more conversations</button> : null}
      </div>
      <footer className="chat-sidebar-footer">Private to you and the other participant.<br />Text messages only. Keep payments in checkout.</footer>
    </aside>
    {selected ? <ConversationPane key={selected} id={selected} onBack={() => setParams({})} /> : <section className="chat-placeholder" aria-label="Choose a conversation"><EmptyState role={user.role} /></section>}
  </div>;
}
