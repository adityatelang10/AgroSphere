import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { listCrops } from "../../services/cropService";
import { getFarmerOrders } from "../../services/orderService";
import { formatCurrency } from "../../utils/formatters";

export default function FarmerDashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({
    cropCount: 0,
    totalStock: 0,
    openOrders: 0,
    revenueSnapshot: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [cropResponse, orderResponse] = await Promise.all([
          listCrops(),
          getFarmerOrders().catch(() => ({ orders: [] })),
        ]);

        const farmerCrops = (cropResponse.crops || []).filter(
          (crop) => crop.farmer?.user?._id === user?.id
        );
        const farmerOrders = orderResponse.orders || [];

        setSummary({
          cropCount: farmerCrops.length,
          totalStock: farmerCrops.reduce(
            (total, crop) => total + Number(crop.stockQuantity || 0),
            0
          ),
          openOrders: farmerOrders.filter((order) => order.status !== "Delivered").length,
          revenueSnapshot: farmerOrders.reduce((total, order) => {
            const orderTotal = order.items.reduce(
              (innerTotal, item) => innerTotal + item.priceAtOrder * item.quantity,
              0
            );
            return total + orderTotal;
          }, 0),
        });
      } catch (requestError) {
        setError(requestError.message || "Failed to load farmer dashboard");
      }
    };

    if (user?.id) {
      loadDashboard();
    }
  }, [user?.id]);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Farmer Command Center
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Manage listings, stock, and delivery flow from one place.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          This dashboard is wired to the live AgroSphere backend. As soon as farmer profile
          creation is added, these cards will reflect real crop and order activity without
          changing the route structure.
        </p>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active listings", value: summary.cropCount },
          { label: "Total stock units", value: summary.totalStock },
          { label: "Open orders", value: summary.openOrders },
          {
            label: "Revenue snapshot",
            value: formatCurrency(summary.revenueSnapshot),
          },
        ].map((item) => (
          <article
            key={item.label}
            className="rounded-[1.8rem] border border-white/60 bg-white/85 p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950/75"
          >
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {item.label}
            </p>
            <p className="mt-4 font-display text-3xl font-semibold text-slate-950 dark:text-slate-50">
              {item.value}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[1.8rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Listing workflow
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            Use the crop management page to create, update, or remove listings. The page is
            already aligned with `POST`, `PUT`, and `DELETE /api/crops`.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/farmer/crops"
              className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Manage crops
            </Link>
            <Link
              to="/farmer/crops/new"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Crop
            </Link>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Order workflow
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            Farmer orders stay synchronized with the backend status lifecycle:
            Pending -&gt; Confirmed -&gt; Dispatched -&gt; Delivered.
          </p>
          <Link
            to="/farmer/orders"
            className="mt-5 inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-amber-400 hover:text-amber-700 dark:border-slate-700 dark:text-slate-200"
          >
            Open order queue
          </Link>
        </article>
      </section>
    </div>
  );
}
