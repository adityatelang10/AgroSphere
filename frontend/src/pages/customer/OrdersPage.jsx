import { useEffect, useState } from "react";

import { getMyOrders } from "../../services/orderService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadOrders = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await getMyOrders();
        setOrders(response.orders || []);
      } catch (requestError) {
        setError(requestError.message || "Failed to load your orders");
      } finally {
        setIsLoading(false);
      }
    };

    loadOrders();
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Order History
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Track deliveries and review your recent purchases.
        </h1>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
          Loading your orders...
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const orderTotal = order.items.reduce(
              (total, item) => total + item.priceAtOrder * item.quantity,
              0
            );

            return (
              <article
                key={order._id}
                className="rounded-[1.8rem] border border-white/60 bg-white/85 p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950/75"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                      Order #{order._id.slice(-6).toUpperCase()}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Placed on {formatDate(order.placedAt)}
                    </p>
                  </div>

                  <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {order.status}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr,18rem]">
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div
                        key={`${order._id}-${item.crop?._id}`}
                        className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900"
                      >
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {item.crop?.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          Farmer: {item.farmer?.farmName} | Quantity: {item.quantity}
                        </p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {formatCurrency(item.priceAtOrder)} / {item.crop?.unit || "unit"}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Delivery
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      {order.deliveryAddress?.line1}
                      {order.deliveryAddress?.line2 ? `, ${order.deliveryAddress.line2}` : ""}
                      <br />
                      {order.deliveryAddress?.villageOrCity}, {order.deliveryAddress?.district}
                      <br />
                      {order.deliveryAddress?.state} - {order.deliveryAddress?.pincode}
                    </p>
                    <p className="mt-4 text-sm font-semibold text-slate-950 dark:text-slate-50">
                      Order total: {formatCurrency(orderTotal)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
