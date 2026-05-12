import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

const initialFormState = {
  name: "",
  email: "",
  password: "",
  role: "CUSTOMER",
  deliveryAddress: {
    line1: "",
    line2: "",
    villageOrCity: "",
    district: "",
    state: "",
    pincode: "",
  },
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formState, setFormState] = useState(initialFormState);
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

  const handleAddressChange = (event) => {
    const { name, value } = event.target;
    setFormState((currentState) => ({
      ...currentState,
      deliveryAddress: {
        ...currentState.deliveryAddress,
        [name]: value,
      },
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const payload =
        formState.role === "CUSTOMER"
          ? formState
          : {
              name: formState.name,
              email: formState.email,
              password: formState.password,
              role: formState.role,
            };

      const user = await register(payload);
      navigate(user.role === "FARMER" ? "/farmer/dashboard" : "/marketplace", {
        replace: true,
      });
    } catch (requestError) {
      if (requestError?.data?.errors && Array.isArray(requestError.data.errors)) {
        const mappedErrors = {};
        requestError.data.errors.forEach((err) => {
          if (err.path) mappedErrors[err.path] = err.msg;
        });
        setFieldErrors(mappedErrors);
        setError("Please fix the errors below.");
      } else {
        setError(requestError.message || "Registration failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
        Join AgroSphere
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-slate-950 dark:text-slate-50">
        Create your farmer or customer account
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Customers can place orders immediately. Farmers will register here and add their
        farm profile in the next step of the product flow.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Full Name
          </span>
          <input
            name="name"
            value={formState.name}
            onChange={handleChange}
            required
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {fieldErrors.name && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.name}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Role
          </span>
          <select
            name="role"
            value={formState.role}
            onChange={handleChange}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="CUSTOMER">Customer</option>
            <option value="FARMER">Farmer</option>
          </select>
        </label>

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

        {formState.role === "CUSTOMER" ? (
          <>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Address Line 1
              </span>
              <input
                name="line1"
                value={formState.deliveryAddress.line1}
                onChange={handleAddressChange}
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Address Line 2
              </span>
              <input
                name="line2"
                value={formState.deliveryAddress.line2}
                onChange={handleAddressChange}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Village or City
              </span>
              <input
                name="villageOrCity"
                value={formState.deliveryAddress.villageOrCity}
                onChange={handleAddressChange}
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                District
              </span>
              <input
                name="district"
                value={formState.deliveryAddress.district}
                onChange={handleAddressChange}
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                State
              </span>
              <input
                name="state"
                value={formState.deliveryAddress.state}
                onChange={handleAddressChange}
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Pincode
              </span>
              <input
                name="pincode"
                value={formState.deliveryAddress.pincode}
                onChange={handleAddressChange}
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 md:col-span-2">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 md:col-span-2"
        >
          {isSubmitting ? "Creating account..." : "Register"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-emerald-700 dark:text-emerald-400">
          Login here
        </Link>
      </p>
    </section>
  );
}
