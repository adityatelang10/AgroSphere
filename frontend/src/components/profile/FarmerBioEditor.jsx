import { useEffect, useId, useRef, useState } from "react";
import { updateFarmerBio } from "../../services/farmerProfileService";

const MAX_BIO_LENGTH = 500;

export default function FarmerBioEditor({ savedBio = "", onSaved }) {
  const [bio, setBio] = useState(savedBio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const pending = useRef(false);
  const inputId = useId();
  const remaining = MAX_BIO_LENGTH - bio.length;

  useEffect(() => { setBio(savedBio); }, [savedBio]);

  const save = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    if (bio.length > MAX_BIO_LENGTH) {
      setError("Shorten your bio to 500 characters or fewer before saving.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const result = await updateFarmerBio(bio.trim());
      setBio(result.bio);
      onSaved(result.bio);
      setFeedback("Bio saved. Your public farmer profile is updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not save your bio. Please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-5 min-w-0 space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Farm bio</label>
      <p id={`${inputId}-help`} className="text-sm text-slate-500 dark:text-slate-400">Tell customers about your farm. This bio is public; avoid private contact details.</p>
      <textarea
        id={inputId}
        name="bio"
        rows={4}
        maxLength={MAX_BIO_LENGTH}
        value={bio}
        disabled={saving}
        aria-describedby={`${inputId}-help ${inputId}-count`}
        aria-invalid={remaining < 0 || Boolean(error)}
        onChange={(event) => { setBio(event.target.value); setError(""); setFeedback(""); }}
        placeholder="Share a little about your farm and what you grow."
        className="block w-full min-w-0 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:text-sm"
      />
      <p id={`${inputId}-count`} className={`text-xs ${remaining < 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`}>
        {remaining < 0 ? `Shorten by ${-remaining} characters to meet the 500-character limit.` : `${remaining} characters remaining`}
      </p>
      <button type="submit" disabled={saving || remaining < 0 || bio === savedBio} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Saving..." : "Save bio"}
      </button>
      {error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
      {feedback ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{feedback}</p> : null}
    </form>
  );
}
