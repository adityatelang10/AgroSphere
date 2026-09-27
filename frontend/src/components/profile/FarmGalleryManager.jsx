import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addFarmGalleryImages, removeFarmGalleryImage } from "../../services/farmerProfileService";
import { selectFarmImages } from "../../utils/farmGallery";
import CropImage from "../marketplace/CropImage";

const buttonClass = "rounded-xl border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950";

export default function FarmGalleryManager({ profile, onChange }) {
  const [selected, setSelected] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef(null);
  const pending = useRef(false);
  const gallery = profile.gallery || [];

  useEffect(() => {
    const urls = selected.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [selected]);

  const chooseFiles = (event) => {
    const result = selectFarmImages(selected, Array.from(event.target.files || []), gallery.length);
    setSelected(result.files);
    setError(result.error);
    setFeedback("");
    event.target.value = "";
  };
  const perform = async (operation, successMessage) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await operation();
      onChange(response.gallery);
      setFeedback(successMessage);
    } catch (requestError) {
      setError(requestError.message || "Could not update your farm gallery.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const upload = () => perform(async () => {
    const response = await addFarmGalleryImages(selected);
    setSelected([]);
    return response;
  }, "Farm photos added to your public profile.");

  return (
    <section className="min-w-0 rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-6" aria-labelledby="farm-gallery-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="farm-gallery-heading" className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">Farm Gallery</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Share your farm, crops and farming activity. These photos are public.</p>
        </div>
        <Link className={buttonClass} to={`/farmer/${profile._id}`}>View public profile</Link>
      </div>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{gallery.length}/8 photos · JPEG, PNG or WEBP · Up to 5 MB each. Crop listing images are separate.</p>
      {gallery.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {gallery.map((image, index) => (
            <figure key={image._id} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <CropImage src={image.url} alt={`Saved farm photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
              <button type="button" disabled={busy} onClick={() => perform(() => removeFarmGalleryImage(image._id), "Farm photo removed.")} className="w-full px-2 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30" aria-label={`Remove farm photo ${index + 1}`}>Remove photo</button>
            </figure>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No farm photos yet.</p>}
      <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} disabled={busy} aria-label="Choose farm gallery photos" className="sr-only" />
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={buttonClass} disabled={busy || gallery.length + selected.length >= 8} onClick={() => inputRef.current?.click()}>Add photos</button>
        {selected.length > 0 ? <button type="button" disabled={busy} onClick={upload} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50">{busy ? "Saving..." : `Upload ${selected.length} photo${selected.length === 1 ? "" : "s"}`}</button> : null}
      </div>
      {selected.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Selected photos (not uploaded yet)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {selected.map((file, index) => (
              <figure key={`${file.name}-${file.lastModified}`} className="min-w-0 overflow-hidden rounded-xl border border-emerald-200 p-2 dark:border-emerald-900">
                <img src={previews[index]} alt={`Preview of ${file.name}`} className="aspect-[4/3] w-full rounded-lg object-cover" />
                <figcaption className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{file.name}</figcaption>
                <button type="button" disabled={busy} onClick={() => setSelected((files) => files.filter((_, i) => i !== index))} className="mt-1 text-sm text-rose-700 underline underline-offset-2 dark:text-rose-300" aria-label={`Remove selected ${file.name}`}>Remove selection</button>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
      <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{feedback}</p>
    </section>
  );
}
