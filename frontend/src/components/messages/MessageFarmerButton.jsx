import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { startConversation } from "../../services/conversationService";

export default function MessageFarmerButton({ farmerProfileId, cropId, children = "Message Farmer" }) {
  const { user } = useAuth();
  const chat = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (user?.role === "FARMER" || !farmerProfileId) return null;
  const open = async () => {
    if (!user) { navigate("/login", { state: { from: { pathname: location.pathname } } }); return; }
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      const { conversation } = await startConversation(farmerProfileId, cropId);
      chat?.refresh();
      navigate(`/messages?conversation=${conversation._id}`);
    } catch (e) { setError(e.message || "Unable to open conversation."); }
    finally { busy.current = false; setLoading(false); }
  };
  return <div className="min-w-0">
    <button type="button" onClick={open} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-700/30 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50 dark:border-emerald-400/40 dark:text-emerald-200 dark:hover:bg-emerald-950">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.6"><path d="M20 11a8 8 0 0 1-8 8H4l-2 3V11a9 9 0 0 1 18 0Z" /><path d="M7 9h8M7 13h5" /></svg>
      {loading ? "Opening…" : children}
    </button>
    {error ? <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
  </div>;
}
