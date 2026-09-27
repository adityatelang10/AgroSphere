import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_SOCKET_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const connections = new Map();

// Notifications and messaging share one cookie-authenticated connection per session.
export function acquireRealtimeConnection(userId) {
  let entry = connections.get(userId);
  if (!entry) {
    entry = { socket: io(SOCKET_URL, { transports: ["websocket"], withCredentials: true }), users: 0 };
    connections.set(userId, entry);
  }
  entry.users += 1;
  let released = false;
  return { socket: entry.socket, release() {
    if (released) return;
    released = true;
    entry.users -= 1;
    if (!entry.users) { entry.socket.disconnect(); connections.delete(userId); }
  } };
}
