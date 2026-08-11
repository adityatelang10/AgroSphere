import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import NotificationBell from "../ui/NotificationBell";
import ThemeToggle from "../ui/ThemeToggle";

const getLinkClasses = ({ isActive }) =>
  `rounded-full px-3 py-2 text-sm font-medium transition ${
    isActive
      ? "bg-emerald-600 text-white shadow-glow"
      : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
  }`;

export default function TopNav() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const { itemCount } = useCart();
  const canAccessCart = user?.role === "CUSTOMER";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 via-lime-500 to-amber-400 text-lg font-bold text-slate-950 shadow-glow">
            A
          </div>
          <div>
            <NavLink
              to="/marketplace"
              className="font-display text-lg font-bold text-slate-950 dark:text-slate-50"
            >
              AgroSphere
            </NavLink>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI-powered farmer marketplace
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-wrap items-center gap-2">
          <NavLink to="/marketplace" className={getLinkClasses}>
            Marketplace
          </NavLink>

          {user?.role === "CUSTOMER" ? (
            <NavLink to="/orders" className={getLinkClasses}>
              Orders
            </NavLink>
          ) : null}

          {user?.role === "FARMER" ? (
            <>
              <NavLink to="/farmer/dashboard" className={getLinkClasses}>
                Dashboard
              </NavLink>
              <NavLink to="/farmer/crops" className={getLinkClasses}>
                My Crops
              </NavLink>
              <NavLink to="/farmer/orders" className={getLinkClasses}>
                Farmer Orders
              </NavLink>
            </>
          ) : null}

          {isAuthenticated ? (
            <NavLink to="/profile" className={getLinkClasses}>
              Profile
            </NavLink>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          {canAccessCart ? (
            <NavLink
              to="/cart"
              aria-label={`Open cart with ${itemCount} item${itemCount === 1 ? "" : "s"}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
            >
              <span>Cart</span>
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-slate-950">
                {itemCount}
              </span>
            </NavLink>
          ) : null}

          <NotificationBell />
          <ThemeToggle />

          {!isAuthenticated ? (
            <>
              <NavLink to="/login" className={getLinkClasses}>
                Login
              </NavLink>
              <NavLink to="/register" className={getLinkClasses}>
                Register
              </NavLink>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
