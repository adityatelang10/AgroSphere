import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

function RouteLoadingState() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="rounded-3xl border border-emerald-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm dark:border-emerald-900/50 dark:bg-slate-900 dark:text-slate-300">
        Loading your AgroSphere session...
      </div>
    </div>
  );
}

export default function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, isInitializing, user } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return <RouteLoadingState />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (Array.isArray(allowedRoles) && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/marketplace" replace />;
  }

  return <Outlet />;
}
