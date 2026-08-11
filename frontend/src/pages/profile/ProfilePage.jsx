import { useEffect, useState } from "react";

import { useAuth } from "../../context/AuthContext";

const emptyAddress = {
  line1: "",
  line2: "",
  villageOrCity: "",
  district: "",
  state: "",
  pincode: "",
};

const fieldClassName =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function ProfilePage() {
  const { user, updateDeliveryAddress } = useAuth();
  const [address, setAddress] = useState(emptyAddress);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setAddress({ ...emptyAddress, ...(user?.deliveryAddress || {}) });
  }, [user?.deliveryAddress]);

  const handleAddressChange = (event) => {
    const { name, value } = event.target;
    setAddress((currentAddress) => ({ ...currentAddress, [name]: value }));
    setFeedback("");
    setError("");
  };

  const handleAddressSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");
    setError("");

    try {
      await updateDeliveryAddress(address);
      setFeedback("Delivery address saved. Your cart is ready for checkout.");
    } catch (requestError) {
      setError(requestError.message || "We could not save your delivery address.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Profile
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Your AgroSphere account
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          Keep your account and delivery details current. A complete address lets farmers send your
          order to the right place without checkout delays.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.75fr,1.25fr]">
        <article className="rounded-[1.8rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Account details
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Name</dt>
              <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Email</dt>
              <dd className="mt-1 break-words font-medium text-slate-900 dark:text-slate-100">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Role</dt>
              <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">{user?.role}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-[1.8rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">Checkout ready</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Delivery address</h2>
            </div>
            {user?.deliveryAddress ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Saved address</span>
            ) : null}
          </div>

          {user?.role === "CUSTOMER" ? (
            <form onSubmit={handleAddressSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Address line 1</span>
                <input name="line1" value={address.line1} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Address line 2 <span className="font-normal text-slate-400">(optional)</span></span>
                <input name="line2" value={address.line2} onChange={handleAddressChange} className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Village or city</span>
                <input name="villageOrCity" value={address.villageOrCity} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">District</span>
                <input name="district" value={address.district} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">State</span>
                <input name="state" value={address.state} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">6-digit pincode</span>
                <input name="pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={address.pincode} onChange={handleAddressChange} required className={fieldClassName} />
              </label>

              {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 sm:col-span-2">{error}</p> : null}
              {feedback ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 sm:col-span-2">{feedback}</p> : null}

              <button type="submit" disabled={isSaving} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
                {isSaving ? "Saving address..." : "Save delivery address"}
              </button>
            </form>
          ) : (
            <p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
              Delivery details are available to customer accounts. Your farmer dashboard is ready for managing crops and incoming orders.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
