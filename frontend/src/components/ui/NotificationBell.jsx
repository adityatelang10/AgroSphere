import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import useNotifications from "../../hooks/useNotifications";
import { formatDate } from "../../utils/formatters";

const getNotificationPath = (userRole) => {
  if (userRole === "FARMER") {
    return "/farmer/orders";
  }

  return "/orders";
};

export default function NotificationBell() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const {
    notifications,
    unreadCount,
    lastEvent,
    markAllAsRead,
    clearNotifications,
  } = useNotifications(user?.id, {
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!lastEvent) {
      return undefined;
    }

    setToast(lastEvent);

    const timerId = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [lastEvent]);

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setIsOpen((currentValue) => !currentValue);
            if (!isOpen) {
              markAllAsRead();
            }
          }}
          className="relative inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/90 p-2.5 text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-label="Open notifications"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
            <path
              d="M15 17H9m9-1V11a6 6 0 1 0-12 0v5l-2 2h16l-2-2Zm-8 2a2 2 0 0 0 4 0"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </span>
          ) : null}
        </button>

        {isOpen ? (
          <div className="absolute right-0 z-40 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Notifications
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time order activity
                </p>
              </div>
              <button
                type="button"
                onClick={clearNotifications}
                className="text-xs font-medium text-slate-500 transition hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
              >
                Clear
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    to={getNotificationPath(user.role)}
                    className="block border-b border-slate-100 px-4 py-3 transition last:border-b-0 hover:bg-emerald-50/70 dark:border-slate-900 dark:hover:bg-slate-900"
                    onClick={() => setIsOpen(false)}
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {notification.payload?.message || "New AgroSphere notification"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(notification.createdAt)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed right-4 top-20 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl dark:border-emerald-900/50 dark:bg-slate-950">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {toast.type === "orderPlaced" ? "New Order" : "Order Updated"}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {toast.payload?.message}
          </p>
        </div>
      ) : null}
    </>
  );
}
