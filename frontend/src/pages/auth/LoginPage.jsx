import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formState, setFormState] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const newFieldErrors = {};
    if (!formState.email.trim()) newFieldErrors.email = "Email is required";
    if (!formState.password.trim()) newFieldErrors.password = "Password is required";

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await login(formState);
      const fallbackPath = user.role === "FARMER" ? "/farmer/dashboard" : "/marketplace";
      const targetPath = location.state?.from?.pathname || fallbackPath;
      navigate(targetPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
        Welcome Back
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-slate-950 dark:text-slate-50">
        Sign in to AgroSphere
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Access your marketplace account using the secure HTTP-only session cookie.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Email
          </span>
          <input
            name="email"
            type="email"
            value={formState.email}
            onChange={handleChange}
            required
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {fieldErrors.email && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.email}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Password
          </span>
          <input
            name="password"
            type="password"
            value={formState.password}
            onChange={handleChange}
            required
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {fieldErrors.password && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.password}</p>}
        </label>

        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSubmitting ? "Signing in..." : "Login"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
        New to AgroSphere?{" "}
        <Link to="/register" className="font-medium text-emerald-700 dark:text-emerald-400">
          Create an account
        </Link>
      </p>
    </section>
  );
}
