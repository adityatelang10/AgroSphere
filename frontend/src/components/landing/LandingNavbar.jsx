import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Arrow, Wordmark } from "./LandingPrimitives";

const links = [
  ["Features", "#features"], ["How it works", "#journey"],
  ["Intelligence", "#intelligence"], ["Marketplace", "/marketplace"],
  ["Traceability", "#traceability"], ["About", "#about"],
];

function NavLinks({ onSelect }) {
  return links.map(([label, href]) => href.startsWith("#")
    ? <a key={label} href={href} onClick={onSelect}>{label}</a>
    : <Link key={label} to={href} onClick={onSelect}>{label}</Link>);
}

export default function LandingNavbar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const toggle = useRef(null);
  const workspace = user?.role === "FARMER" ? "/farmer/dashboard" : "/marketplace";

  useEffect(() => {
    if (!open) return undefined;
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
      toggle.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <header className="lp-nav" data-landing-nav>
      <Wordmark />
      <nav className="lp-desktop-nav" aria-label="Landing navigation"><NavLinks /></nav>
      <div className="lp-nav-actions">
        <Link className="lp-login" to={user ? workspace : "/login"}>{user ? "My workspace" : "Login"}</Link>
        <Link className="lp-nav-cta" to={user ? workspace : "/register"}>{user ? "Open app" : "Get started"}<Arrow diagonal /></Link>
        <button ref={toggle} className="lp-menu-toggle" aria-label="Open navigation menu" aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => setOpen(true)}><span /><span /></button>
      </div>
    </header>
    <dialog ref={dialog} id="landing-mobile-menu" className="lp-menu" aria-label="Navigation menu" onCancel={() => setOpen(false)}>
      <div className="lp-menu-top"><Wordmark /><button onClick={() => setOpen(false)} aria-label="Close navigation menu">Close <span aria-hidden="true">×</span></button></div>
      <nav aria-label="Mobile landing navigation"><NavLinks onSelect={() => setOpen(false)} /></nav>
      <div className="lp-menu-bottom"><p>Farm data. Better decisions.</p><Link to={user ? workspace : "/login"} onClick={() => setOpen(false)}>{user ? "My workspace" : "Login"}<Arrow diagonal /></Link><Link to={user ? workspace : "/register"} onClick={() => setOpen(false)}>{user ? "Enter AgroSphere" : "Get started"}<Arrow diagonal /></Link></div>
    </dialog>
  </>;
}
