import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import NotificationBell from "../ui/NotificationBell";
import ThemeToggle from "../ui/ThemeToggle";

const getLinkClasses = ({ isActive }) =>
  `whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
    isActive
      ? "bg-emerald-600 text-white shadow-glow"
      : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
  }`;

const FARM_INTELLIGENCE_LINKS = [
  { label: "Crop Advisor", to: "/farmer/crop-recommendation" },
  { label: "Leaf Scanner", to: "/farmer/disease-detection" },
  { label: "Irrigation Advisor", to: "/farmer/irrigation-advisor" },
  { label: "Market Intelligence", to: "/farmer/market-intelligence" },
  { label: "Farm Decision", to: "/farmer/decision-engine" },
  { label: "What-If Simulator", to: "/farmer/what-if-simulator" },
];

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const { uniqueItemCount } = useCart();
  const canAccessCart = user?.role === "CUSTOMER";
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const intelligenceMenuRef = useRef(null);
  const intelligenceButtonRef = useRef(null);
  const isIntelligenceRoute = FARM_INTELLIGENCE_LINKS.some((link) =>
    location.pathname.startsWith(link.to)
  );

  useEffect(() => {
    setIsIntelligenceOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isIntelligenceOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!intelligenceMenuRef.current?.contains(event.target)) {
        setIsIntelligenceOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsIntelligenceOpen(false);
        intelligenceButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isIntelligenceOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-3">
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

        <nav className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 xl:order-none xl:w-auto xl:flex-1 xl:flex-nowrap">
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
              <div ref={intelligenceMenuRef} className="relative">
                <button
                  ref={intelligenceButtonRef}
                  type="button"
                  aria-expanded={isIntelligenceOpen}
                  aria-haspopup="true"
                  aria-controls="farm-intelligence-menu"
                  onClick={() => setIsIntelligenceOpen((isOpen) => !isOpen)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
                    isIntelligenceRoute
                      ? "bg-emerald-600 text-white shadow-glow"
                      : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                  }`}
                >
                  Farm Intelligence
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${
                      isIntelligenceOpen ? "rotate-180" : ""
                    }`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {isIntelligenceOpen ? (
                  <div
                    id="farm-intelligence-menu"
                    aria-label="Farm Intelligence tools"
                    className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-950 sm:left-0 sm:right-auto"
                  >
                    {FARM_INTELLIGENCE_LINKS.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setIsIntelligenceOpen(false)}
                        className={({ isActive }) =>
                          `block rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                            isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                              : "text-slate-700 hover:bg-slate-100 hover:text-emerald-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
              <NavLink to="/farmer/crops" className={getLinkClasses}>
                My Crops
              </NavLink>
              <NavLink to="/farmer/orders" className={getLinkClasses}>
                Farmer Orders
              </NavLink>
            </>
          ) : null}

          {isAuthenticated ? (
            <NavLink
              to="/profile"
              className={(linkState) => `${getLinkClasses(linkState)} xl:ml-auto`}
            >
              Profile
            </NavLink>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {canAccessCart ? (
            <NavLink
              to="/cart"
              aria-label={`Open cart with ${uniqueItemCount} product${uniqueItemCount === 1 ? "" : "s"}`}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
            >
              <span>Cart</span>
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-slate-950">
                {uniqueItemCount}
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
