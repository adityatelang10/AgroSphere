import { useEffect, useState } from "react";

import useNotifications from "../hooks/useNotifications";

const formatNotificationText = (notification) => {
  if (notification.type === "orderPlaced") {
    return notification.payload?.message || "A new order has been placed.";
  }

  if (notification.type === "orderStatusUpdated") {
    return notification.payload?.message || "Your order status has changed.";
  }

  return "New notification";
};

export default function NotificationsDemo({ userId }) {
  const {
    isConnected,
    notifications,
    unreadCount,
    lastEvent,
    markAllAsRead,
    clearNotifications,
  } = useNotifications(userId, {
    enabled: Boolean(userId),
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!lastEvent) {
      return undefined;
    }

    setToast(lastEvent);

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [lastEvent]);

  return (
    <>
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notifications
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Socket status: {isConnected ? "Connected" : "Disconnected"}
            </p>
          </div>

          <button
            type="button"
            onClick={markAllAsRead}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200"
          >
            <span>Inbox</span>
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {unreadCount}
            </span>
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={markAllAsRead}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Mark all as read
          </button>
          <button
            type="button"
            onClick={clearNotifications}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:text-slate-200"
          >
            Clear
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No notifications yet.
            </p>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  notification.read
                    ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                }`}
              >
                <p className="font-medium">{formatNotificationText(notification)}</p>
                <p className="mt-1 text-xs opacity-75">
                  {notification.type === "orderPlaced"
                    ? `Order ID: ${notification.payload?.orderId}`
                    : `Status: ${notification.payload?.status}`}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {toast ? (
        <div className="fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl dark:border-emerald-900/60 dark:bg-slate-950">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {toast.type === "orderPlaced" ? "New Order" : "Order Update"}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {formatNotificationText(toast)}
          </p>
        </div>
      ) : null}
    </>
  );
}
