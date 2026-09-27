import { NavLink } from "react-router-dom";
import { useChat } from "../../context/ChatContext";

export default function MessagesNavLink() {
  const { unreadCount = 0, error } = useChat() || {};
  return <NavLink to="/messages" title={error ? "Messages — inbox temporarily unavailable" : "Messages"}
    aria-label={`Messages${unreadCount ? `, ${unreadCount} unread` : ""}`}
    className={({ isActive }) => `relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-800/20 text-emerald-900 transition hover:bg-emerald-100/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-emerald-200/20 dark:text-emerald-100 dark:hover:bg-emerald-900/50${isActive ? " ring-1 ring-emerald-500" : ""}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.6"><path strokeLinejoin="round" d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z" /><path d="M7 9h9M7 13h6" /></svg>
    {unreadCount > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
  </NavLink>;
}
