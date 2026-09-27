import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { acquireRealtimeConnection } from "../services/realtimeConnection";
import { getConversations } from "../services/conversationService";

const ChatContext = createContext(null);
export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [inbox, setInbox] = useState({ conversations: [], unreadCount: 0, hasMore: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const loaded = useRef(50);
  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const session = epoch.current;
    const request = ++sequence.current;
    try {
      const pages = await Promise.all(Array.from({ length: Math.ceil(loaded.current / 50) }, (_, i) => getConversations(i * 50)));
      if (session !== epoch.current || request !== sequence.current) return;
      const unique = new Map(pages.flatMap((p) => p.conversations).map((c) => [c._id, c]));
      setInbox({ conversations: [...unique.values()], unreadCount: pages[0].unreadCount, hasMore: pages.at(-1).hasMore });
      setError("");
    } catch (e) { if (session === epoch.current && request === sequence.current) setError(e.message); }
    finally { if (session === epoch.current) setLoading(false); }
  }, [user?.id]);

  useEffect(() => {
    epoch.current += 1; loaded.current = 50;
    setInbox({ conversations: [], unreadCount: 0, hasMore: false }); setError(""); setConnected(false);
    if (!user?.id) { setSocket(null); return undefined; }
    setLoading(true);
    const connection = acquireRealtimeConnection(user.id);
    const s = connection.socket;
    setSocket(s); setConnected(s.connected);
    let timer;
    const update = () => { clearTimeout(timer); timer = setTimeout(refresh, 80); };
    const onConnect = () => { setConnected(true); update(); };
    const onDisconnect = () => setConnected(false);
    const onVisible = () => { if (document.visibilityState === "visible") { if (!s.connected) s.connect(); update(); } };
    s.on("connect", onConnect); s.on("disconnect", onDisconnect); s.on("connect_error", onDisconnect);
    s.on("conversation:updated", update);
    document.addEventListener("visibilitychange", onVisible);
    refresh();
    return () => {
      epoch.current += 1; clearTimeout(timer);
      s.off("connect", onConnect); s.off("disconnect", onDisconnect); s.off("connect_error", onDisconnect);
      s.off("conversation:updated", update); document.removeEventListener("visibilitychange", onVisible);
      connection.release();
    };
  }, [user?.id, refresh]);

  const loadMore = async () => { loaded.current += 50; setLoading(true); await refresh(); };
  return <ChatContext.Provider value={{ ...inbox, socket, connected, error, loading, refresh, loadMore }}>{children}</ChatContext.Provider>;
}
export const useChat = () => useContext(ChatContext);
