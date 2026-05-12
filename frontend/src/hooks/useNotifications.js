import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_SOCKET_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const MAX_NOTIFICATIONS = 20;

const buildNotification = (type, payload) => ({
  id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  payload,
  createdAt: new Date().toISOString(),
  read: false,
});

export function useNotifications(userId, { enabled = true } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setIsConnected(false);
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
      query: {
        userId,
      },
    });

    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const pushNotification = (type, payload) => {
      const nextNotification = buildNotification(type, payload);
      setLastEvent(nextNotification);
      setNotifications((currentNotifications) => [
        nextNotification,
        ...currentNotifications,
      ].slice(0, MAX_NOTIFICATIONS));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("orderPlaced", (payload) => pushNotification("orderPlaced", payload));
    socket.on("orderStatusUpdated", (payload) =>
      pushNotification("orderStatusUpdated", payload)
    );

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("orderPlaced");
      socket.off("orderStatusUpdated");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const markAllAsRead = () => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        read: true,
      }))
    );
  };

  const clearNotifications = () => {
    setNotifications([]);
    setLastEvent(null);
  };

  return {
    isConnected,
    notifications,
    unreadCount,
    lastEvent,
    markAllAsRead,
    clearNotifications,
  };
}

export default useNotifications;
