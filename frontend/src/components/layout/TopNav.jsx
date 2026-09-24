import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import NotificationBell from "../ui/NotificationBell";
import ThemeToggle from "../ui/ThemeToggle";
import NavbarBrand from "./NavbarBrand";
import useNavbarScroll from "../../hooks/useNavbarScroll";

const getLinkClasses = ({ isActive }) =>
  `ag-nav-link${isActive ? " is-active" : ""}`;

// The invisible CSS copy reserves the expanded text width, avoiding hover reflow.
function NavLabel({ children }) {
  return <span className="ag-nav-label" data-label={children}><span>{children}</span></span>;
}

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
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const headerRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const intelligenceMenuRef = useRef(null);
  const intelligenceButtonRef = useRef(null);
  const isIntelligenceRoute = FARM_INTELLIGENCE_LINKS.some((link) =>
    location.pathname.startsWith(link.to)
  );
  useNavbarScroll(headerRef, location.pathname, isMobileOpen || isIntelligenceOpen);

  useEffect(() => {
    setIsIntelligenceOpen(false);
    setIsMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const desktop = window.matchMedia("(min-width: 1280px)");
    const onResize = () => { if (desktop.matches) setIsMobileOpen(false); };
    const onPointer = (event) => {
      if (!headerRef.current?.contains(event.target)) {
        setIsMobileOpen(false);
        setIsIntelligenceOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === "Escape" && !isIntelligenceOpen) {
        setIsMobileOpen(false);
        mobileButtonRef.current?.focus({ preventScroll: true });
      }
    };
    desktop.addEventListener("change", onResize);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      desktop.removeEventListener("change", onResize);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMobileOpen, isIntelligenceOpen]);

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
    <header ref={headerRef} className={`ag-app-nav${isMobileOpen ? " is-open" : ""}`}>
      <div className="ag-nav-bar">
        <NavbarBrand to="/marketplace" />
        {canAccessCart ? (
          <NavLink
            to="/cart"
            aria-label={`Open cart with ${uniqueItemCount} product${uniqueItemCount === 1 ? "" : "s"}`}
            className={({ isActive }) => `ag-nav-cart${isActive ? " is-active" : ""}`}
          >
            <span>Cart</span><span className="ag-cart-count">{uniqueItemCount}</span>
          </NavLink>
        ) : null}
        <button ref={mobileButtonRef} type="button" className="ag-menu-toggle" aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={isMobileOpen} aria-controls="app-navigation-panel" onClick={() => {
          setIsMobileOpen((open) => !open);
          setIsIntelligenceOpen(false);
        }}>
          <span /><span />
        </button>
        <div id="app-navigation-panel" className="ag-nav-panel">
        <nav className="ag-nav-links" aria-label="Application navigation" onClick={(event) => { if (event.target.closest("a")) setIsMobileOpen(false); }}>
          <NavLink to="/marketplace" className={getLinkClasses}>
            <NavLabel>Marketplace</NavLabel>
          </NavLink>

          {user?.role === "CUSTOMER" ? (
            <NavLink to="/orders" className={getLinkClasses}>
              <NavLabel>Orders</NavLabel>
            </NavLink>
          ) : null}

          {user?.role === "FARMER" ? (
            <>
              <NavLink to="/farmer/dashboard" className={getLinkClasses}>
                <NavLabel>Dashboard</NavLabel>
              </NavLink>
              <div ref={intelligenceMenuRef} className="ag-intelligence">
                <button
                  ref={intelligenceButtonRef}
                  type="button"
                  aria-expanded={isIntelligenceOpen}
                  aria-haspopup="true"
                  aria-controls="farm-intelligence-menu"
                  onClick={() => setIsIntelligenceOpen((isOpen) => !isOpen)}
                  className={`ag-nav-link${isIntelligenceRoute ? " is-active" : ""}`}
                >
                  <NavLabel>Farm Intelligence</NavLabel>
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
                    className="ag-intelligence-menu"
                  >
                    {FARM_INTELLIGENCE_LINKS.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        onClick={() => setIsIntelligenceOpen(false)}
                        className={({ isActive }) =>
                          `ag-tool-link${isActive ? " is-active" : ""}`
                        }
                      >
                        <NavLabel>{link.label}</NavLabel>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
              <NavLink to="/farmer/crops" className={getLinkClasses}>
                <NavLabel>My Crops</NavLabel>
              </NavLink>
              <NavLink to="/farmer/orders" className={getLinkClasses}>
                <NavLabel>Farmer Orders</NavLabel>
              </NavLink>
            </>
          ) : null}

          {isAuthenticated ? (
            <NavLink
              to="/profile"
              className={getLinkClasses}
            >
              <NavLabel>Profile</NavLabel>
            </NavLink>
          ) : null}
        </nav>

        <div className="ag-nav-tools">
          <div className="ag-nav-notifications"><NotificationBell /></div>
          <div className="ag-nav-theme"><ThemeToggle /></div>

          {!isAuthenticated ? (
            <>
              <NavLink to="/login" className={getLinkClasses}>
                <NavLabel>Login</NavLabel>
              </NavLink>
              <NavLink to="/register" className="ag-nav-cta">
                Get started
              </NavLink>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="ag-nav-cta"
            >
              Logout
            </button>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
