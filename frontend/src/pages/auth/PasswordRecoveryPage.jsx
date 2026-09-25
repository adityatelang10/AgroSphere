import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import PasswordInput from "../../components/ui/PasswordInput";
import { requestPasswordReset, resetPassword } from "../../services/authService";

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function PasswordRecoveryPage({ reset = false }) {
  const { logout } = useAuth();
  const [token, setToken] = useState(() => reset ? new URLSearchParams(window.location.hash.slice(1)).get("token") || "" : "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const submittingRef = useRef(false);
  const hasToken = /^[a-f0-9]{64}$/.test(token);

  useEffect(() => {
    // Keep the one-time link out of navigation history and screenshots after load.
    const consumeFragment = () => {
      if (!reset || !window.location.hash) return;
      setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
      setComplete(false);
      setMessage("");
      setError("");
      setPassword("");
      setConfirmPassword("");
      window.history.replaceState(window.history.state, "", window.location.pathname);
    };
    consumeFragment();
    // Opening a new email link in an already-open reset page may only change its hash.
    window.addEventListener("hashchange", consumeFragment);
    return () => window.removeEventListener("hashchange", consumeFragment);
  }, [reset]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || complete || (reset && !hasToken)) return;
    setError("");
    setMessage("");
    if (reset && (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) ||
        new TextEncoder().encode(password).length > 72 || password !== confirmPassword)) {
      setError("Passwords must match and contain at least 8 characters, an uppercase letter and a number (maximum 72 UTF-8 bytes).");
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      const response = reset
        ? await resetPassword({ token, password, confirmPassword })
        : await requestPasswordReset(email.trim());
      if (reset) {
        setPassword("");
        setConfirmPassword("");
        setToken("");
        await logout();
      }
      setMessage(response.message);
      setComplete(true);
    } catch (requestError) {
      const retryAfter = Number(requestError.data?.retryAfterSeconds);
      setError(requestError.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
        ? `Too many recovery attempts. Please wait about ${Math.ceil(retryAfter / 60)} minute(s) before trying again.`
        : requestError.message || "Password recovery is unavailable. Please try again later.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/90">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">AgroSphere account recovery</p>
      <h1 className="mt-3 font-display text-3xl font-bold text-slate-950 dark:text-slate-50">{reset ? "Set a new password" : "Forgot password?"}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {reset ? "Choose a new password. After resetting, sign in again on your devices." : "Enter your account’s email address. We’ll email a single-use reset link that expires in 15 minutes."}
      </p>
      {reset && !hasToken && !complete ? (
        <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">This page needs a valid reset link. Open the full link from your email, or request a new one.</p>
      ) : !complete ? (
        <form onSubmit={handleSubmit} aria-busy={busy} className="mt-6 space-y-4">
          {reset ? <>
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <label htmlFor="reset-password" className="mb-2 block">New password</label>
              <PasswordInput id="reset-password" name="password" className={inputClass} autoComplete="new-password" aria-describedby="reset-password-rules" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required disabled={busy} />
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <label htmlFor="confirm-reset-password" className="mb-2 block">Confirm new password</label>
              <PasswordInput id="confirm-reset-password" name="confirmPassword" className={inputClass} autoComplete="new-password" aria-describedby="reset-password-rules" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={72} required disabled={busy} />
            </div>
            <p id="reset-password-rules" className="text-sm text-slate-500 dark:text-slate-400">At least 8 characters, including an uppercase letter and a number. Maximum 72 UTF-8 bytes.</p>
          </> : (
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              <span className="mb-2 block">Email</span>
              <input className={inputClass} type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} />
            </label>
          )}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:bg-slate-400">{busy ? "Please wait..." : reset ? "Reset password" : "Send reset link"}</button>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}
      {message ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</p> : null}
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <Link to="/login">Back to login</Link>
        {reset && !complete ? <Link to="/forgot-password">Request a new link</Link> : null}
      </div>
    </section>
  );
}
