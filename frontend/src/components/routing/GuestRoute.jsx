import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

export default function GuestRoute() {
  const { isAuthenticated, isInitializing, user } = useAuth();

  if (isInitializing) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="rounded-3xl border border-emerald-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm dark:border-emerald-900/50 dark:bg-slate-900 dark:text-slate-300">
          Preparing AgroSphere...
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={user?.role === "FARMER" ? "/farmer/dashboard" : "/marketplace"}
        replace
      />
    );
  }

  return <Outlet />;
}
