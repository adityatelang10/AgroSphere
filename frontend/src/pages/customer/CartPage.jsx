import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { checkout } from "../../services/orderService";
import { formatCurrency } from "../../utils/formatters";

const FREE_DELIVERY_THRESHOLD = 800;

function BasketIcon({ className = "" }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.5h18M5.25 5.5l1 14h11.5l1-14M9.25 9.5v6M14.75 9.5v6" />
    </svg>
  );
}

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, itemCount, subtotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState("");

  const address = user?.deliveryAddress;
  const hasDeliveryAddress = Boolean(
    address?.line1 &&
      address?.villageOrCity &&
      address?.district &&
      address?.state &&
      address?.pincode
  );
  const remainingForDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);
  const deliveryProgress = Math.min((subtotal / FREE_DELIVERY_THRESHOLD) * 100, 100);

  const handleCheckout = async () => {
    if (!hasDeliveryAddress) {
      navigate("/profile");
      return;
    }

    setError("");
    setIsCheckingOut(true);

    try {
      await checkout({
        items: items.map((item) => ({ cropId: item.cropId, quantity: item.quantity })),
        deliveryAddress: address,
      });
      clearCart();
      navigate("/orders");
    } catch (requestError) {
      setError(requestError.message || "We could not place your order. Please try again.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (items.length === 0) {
    return (
      <section className="mx-auto flex min-h-[58vh] max-w-2xl flex-col items-center justify-center rounded-[2.25rem] border border-white/60 bg-white/85 px-6 py-12 text-center shadow-xl dark:border-slate-800 dark:bg-slate-950/75">
        <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-emerald-500 to-lime-400 text-white shadow-lg shadow-emerald-600/25">
          <BasketIcon className="h-10 w-10" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">Your harvest basket</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-white">Nothing in your cart yet</h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-slate-600 dark:text-slate-300">Browse seasonal crops, add what you need, and your farmer-direct order will appear right here.</p>
        <Link to="/marketplace" className="mt-7 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-500">Explore fresh crops</Link>
      </section>
    );
  }

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[2.25rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">Farm-direct checkout</p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Your harvest cart</h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{itemCount} item{itemCount === 1 ? "" : "s"} selected from local farms. Adjust quantities any time before checkout.</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"><BasketIcon className="h-7 w-7" /></div>
        </div>
        <div className="mt-7 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-950 dark:bg-emerald-950/25">
          <div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium text-emerald-900 dark:text-emerald-100">{remainingForDelivery ? `${formatCurrency(remainingForDelivery)} away from priority farm delivery` : "Priority farm delivery unlocked"}</span><span className="font-bold text-emerald-700 dark:text-emerald-400">{Math.round(deliveryProgress)}%</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-500" style={{ width: `${deliveryProgress}%` }} /></div>
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr),22rem]">
        <section className="space-y-4">
          {items.map((item) => {
            const atStockLimit = Number.isFinite(item.stockQuantity) && item.quantity >= item.stockQuantity;

            return (
              <article key={item.cropId} className="flex flex-col gap-4 rounded-[1.75rem] border border-white/60 bg-white/85 p-4 shadow-lg dark:border-slate-800 dark:bg-slate-950/75 sm:flex-row sm:items-center sm:p-5">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-24 w-full rounded-2xl object-cover sm:w-28" /> : <div className="flex h-24 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 text-3xl dark:from-emerald-950 dark:via-slate-900 dark:to-amber-950 sm:w-28">&#127807;</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Farm fresh</p>
                  <h2 className="mt-1 truncate font-display text-xl font-semibold text-slate-950 dark:text-white">{item.name}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatCurrency(item.price)} / {item.unit}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                      <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.cropId, item.quantity - 1)} className="h-8 w-8 rounded-lg text-xl text-slate-600 transition hover:bg-white hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800">−</button>
                      <span className="min-w-10 px-2 text-center text-sm font-bold text-slate-900 dark:text-white">{item.quantity}</span>
                      <button type="button" aria-label={`Increase ${item.name} quantity`} disabled={atStockLimit} onClick={() => updateQuantity(item.cropId, item.quantity + 1)} className="h-8 w-8 rounded-lg text-xl text-slate-600 transition hover:bg-white hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">+</button>
                    </div>
                    <button type="button" onClick={() => removeFromCart(item.cropId)} className="text-sm font-semibold text-rose-600 transition hover:text-rose-700 dark:text-rose-400">Remove</button>
                  </div>
                  {atStockLimit ? <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">Maximum currently available quantity reached.</p> : null}
                </div>
                <p className="self-end font-display text-xl font-bold text-slate-950 dark:text-white sm:self-center">{formatCurrency(item.price * item.quantity)}</p>
              </article>
            );
          })}
        </section>

        <aside className="h-fit rounded-[1.75rem] border border-white/60 bg-slate-950 p-6 text-white shadow-xl xl:sticky xl:top-28 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">Order summary</p>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <div className="flex justify-between"><span>Produce ({itemCount})</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span>Farm delivery</span><span className="font-semibold text-lime-300">Included</span></div>
            <div className="flex justify-between border-t border-slate-700 pt-4 font-display text-xl font-bold text-white"><span>Total</span><span>{formatCurrency(subtotal)}</span></div>
          </div>
          {error ? <p className="mt-5 rounded-xl bg-rose-500/15 px-3 py-2 text-sm leading-6 text-rose-200">{error}</p> : null}
          {!hasDeliveryAddress ? <button type="button" onClick={() => navigate("/profile")} className="mt-6 w-full rounded-xl bg-amber-400 px-4 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300">Add delivery address</button> : <button type="button" disabled={isCheckingOut} onClick={handleCheckout} className="mt-6 w-full rounded-xl bg-lime-400 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-lime-500/20 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60">{isCheckingOut ? "Placing your order..." : "Place secure order"}</button>}
          <p className="mt-4 text-center text-xs leading-5 text-slate-400">Direct farmer payment · Live order updates · No hidden platform fees</p>
        </aside>
      </div>
    </div>
  );
}
