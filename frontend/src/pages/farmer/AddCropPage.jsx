import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createCrop } from "../../services/cropService";

const initialFormState = {
  name: "",
  category: "Vegetables",
  description: "",
  price: "",
  unit: "kg",
  stockQuantity: "",
  season: "Year-round",
  isOrganic: false,
  district: "",
  state: "",
};

export default function AddCropPage() {
  const navigate = useNavigate();
  const [formState, setFormState] = useState(initialFormState);
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleImageChange = (event) => {
    if (event.target.files && event.target.files[0]) {
      setImageFile(event.target.files[0]);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      // In a real application, you'd use FormData if uploading a file
      // Since the backend handles image upload via multipart/form-data,
      // we prepare a FormData object.
      const formData = new FormData();
      Object.entries(formState).forEach(([key, value]) => {
        formData.append(key, value);
      });
      if (imageFile) {
        formData.append("images", imageFile);
      }

      await createCrop(formData);
      navigate("/farmer/crops", { replace: true });
    } catch (requestError) {
      if (requestError?.data?.errors && Array.isArray(requestError.data.errors)) {
        const mappedErrors = {};
        requestError.data.errors.forEach((err) => {
          if (err.path) mappedErrors[err.path] = err.msg;
        });
        setFieldErrors(mappedErrors);
        setError("Please fix the validation errors below.");
      } else {
        setError(requestError.message || "Failed to add crop.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center gap-4">
        <Link
          to="/farmer/crops"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
            New Listing
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-slate-950 dark:text-slate-50">
            Add a Crop
          </h1>
        </div>
      </div>

      <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
          
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Crop Name
            </span>
            <input
              name="name"
              value={formState.name}
              onChange={handleChange}
              required
              placeholder="e.g. Organic Tomatoes"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.name && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.name}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Category
            </span>
            <select
              name="category"
              value={formState.category}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="Vegetables">Vegetables</option>
              <option value="Fruits">Fruits</option>
              <option value="Grains">Grains</option>
              <option value="Spices">Spices</option>
              <option value="Other">Other</option>
            </select>
            {fieldErrors.category && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.category}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Season
            </span>
            <select
              name="season"
              value={formState.season}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="Kharif">Kharif</option>
              <option value="Rabi">Rabi</option>
              <option value="Zaid">Zaid</option>
              <option value="Year-round">Year-round</option>
            </select>
            {fieldErrors.season && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.season}</p>}
          </label>

          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Description
            </span>
            <textarea
              name="description"
              value={formState.description}
              onChange={handleChange}
              required
              rows={3}
              placeholder="Provide details about the crop quality, farming methods, etc."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.description && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.description}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Price (₹)
            </span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              value={formState.price}
              onChange={handleChange}
              required
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.price && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.price}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Unit
            </span>
            <select
              name="unit"
              value={formState.unit}
              onChange={handleChange}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="kg">kg</option>
              <option value="gram">gram</option>
              <option value="quintal">quintal</option>
              <option value="dozen">dozen</option>
              <option value="piece">piece</option>
              <option value="bundle">bundle</option>
              <option value="packet">packet</option>
              <option value="litre">litre</option>
            </select>
            {fieldErrors.unit && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.unit}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Stock Quantity
            </span>
            <input
              name="stockQuantity"
              type="number"
              min="0"
              value={formState.stockQuantity}
              onChange={handleChange}
              required
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.stockQuantity && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.stockQuantity}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              District
            </span>
            <input
              name="district"
              value={formState.district}
              onChange={handleChange}
              required
              placeholder="e.g. Pune"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.district && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.district}</p>}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              State
            </span>
            <input
              name="state"
              value={formState.state}
              onChange={handleChange}
              required
              placeholder="e.g. Maharashtra"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.state && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.state}</p>}
          </label>

          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Crop Image
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {fieldErrors.image && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{fieldErrors.image}</p>}
          </label>

          <label className="flex items-center gap-3 md:col-span-2">
            <input
              type="checkbox"
              name="isOrganic"
              checked={formState.isOrganic}
              onChange={handleChange}
              className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              This crop is certified organic
            </span>
          </label>

          {error && (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 md:col-span-2">
              {error}
            </p>
          )}

          <div className="md:col-span-2 flex justify-end gap-4 mt-2">
            <Link
              to="/farmer/crops"
              className="rounded-2xl px-6 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Saving..." : "Save Crop"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
