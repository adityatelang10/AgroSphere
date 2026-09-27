export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((m) => [m._id, m]));
  incoming.forEach((m) => byId.set(m._id, { ...byId.get(m._id), ...m, readAt: m.readAt || byId.get(m._id)?.readAt || null }));
  return [...byId.values()].sort((a, b) => a._id.localeCompare(b._id));
}
export const counterpart = (conversation, role) => (role === "CUSTOMER" ? conversation.farmer : conversation.customer) || { name: "Account unavailable" };
export const chatTime = (date) => date ? new Date(date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
export function chatDay(date, now = new Date()) {
  const day = new Date(date);
  if (day.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (day.toDateString() === yesterday.toDateString()) return "Yesterday";
  return day.toLocaleDateString([], { month: "short", day: "numeric", ...(day.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
