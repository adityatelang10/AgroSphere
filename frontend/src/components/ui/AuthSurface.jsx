import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./authSurface.css";

export default function AuthSurface({ children, register = false }) {
  const navigate = useNavigate();
  const handleSwitch = (event) => {
    const link = event.target.closest("a[data-auth-switch]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    document.startViewTransition(() => flushSync(() => navigate(link.getAttribute("href"))));
  };

  return (
    <section className={`auth-surface ${register ? "auth-surface--register" : ""}`} onClickCapture={handleSwitch}>
      <div className="auth-surface__form">{children}</div>
      <aside className="auth-surface__visual" aria-label="AgroSphere: growing a more connected future">
        <div className="auth-surface__visual-brand">AGROSPHERE <span>ROOTED IN POSSIBILITY</span></div>
        <div className="auth-botanical" aria-hidden="true">
          <div className="auth-botanical__halo" />
          <div className="auth-botanical__orb" />
          <div className="auth-botanical__stem" />
          <div className="auth-botanical__leaf auth-botanical__leaf--one" />
          <div className="auth-botanical__leaf auth-botanical__leaf--two" />
          <div className="auth-botanical__leaf auth-botanical__leaf--three" />
          <div className="auth-botanical__ground" />
        </div>
        <div className="auth-surface__visual-copy">
          <span>FROM THE FIELD. FOR THE FUTURE.</span>
          <h2>A little closer<br />to what grows.</h2>
          <p>Connect with farmers, discover fresh produce, and make room for better decisions.</p>
        </div>
      </aside>
    </section>
  );
}
