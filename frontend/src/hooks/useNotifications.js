import { useEffect, useMemo, useRef, useState } from "react";
import { acquireRealtimeConnection } from "../services/realtimeConnection";

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
    setNotifications([]);
    setLastEvent(null);
    setIsConnected(false);

    if (!enabled || !userId) {
      return undefined;
    }

    const { socket, release } = acquireRealtimeConnection(userId);
    setIsConnected(socket.connected);

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
    socket.on("connect_error", handleDisconnect);
    const onPlaced = (payload) => pushNotification("orderPlaced", payload);
    const onUpdated = (payload) => pushNotification("orderStatusUpdated", payload);
    socket.on("orderPlaced", onPlaced);
    socket.on("orderStatusUpdated", onUpdated);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleDisconnect);
      socket.off("orderPlaced", onPlaced);
      socket.off("orderStatusUpdated", onUpdated);
      release();
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
