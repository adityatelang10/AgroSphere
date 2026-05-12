import { useAuth } from "../../context/AuthContext";

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Profile
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Your AgroSphere account
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
          The frontend keeps only minimal user details in memory. Authentication continues to
          rely on the HTTP-only backend cookie for secure session verification.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr,1.1fr]">
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
              <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Role</dt>
              <dd className="mt-1 font-medium text-slate-900 dark:text-slate-100">{user?.role}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-[1.8rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Delivery address
          </h2>
          {user?.deliveryAddress ? (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {user.deliveryAddress.line1}
              {user.deliveryAddress.line2 ? `, ${user.deliveryAddress.line2}` : ""}
              <br />
              {user.deliveryAddress.villageOrCity}, {user.deliveryAddress.district}
              <br />
              {user.deliveryAddress.state} - {user.deliveryAddress.pincode}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
              Farmer accounts do not store a customer delivery address by default.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
