import { useId, useRef, useState } from "react";
import { createReview, updateReview } from "../../services/reviewService";
import { RatingStars } from "./RatingSummary";

export default function OrderItemReview({ orderId, crop, review, onSaved }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(review?.rating || 0);
  const [comment, setComment] = useState(review?.comment || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const pending = useRef(false);
  const id = useId();
  const startEdit = () => {
    setRating(review?.rating || 0);
    setComment(review?.comment || "");
    setError(""); setFeedback(""); setOpen(true);
  };
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    if (!rating) { setError("Choose a rating from 1 to 5 stars."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const values = { rating, comment: comment.trim() };
      const response = review
        ? await updateReview(review._id, values)
        : await createReview({ ...values, orderId, cropId: crop._id });
      onSaved(response.review);
      setOpen(false);
      setFeedback(review ? "Your review was updated." : "Thank you. Your verified review is now public.");
    } catch (requestError) {
      setError(requestError.data?.errors?.[0]?.msg || requestError.message || "Could not save your review. Please try again.");
    } finally { pending.current = false; setBusy(false); }
  };
  return (
    <section className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700" aria-label={`Review ${crop.name}`}>
      {review ? <div className="mb-2">
        <RatingStars rating={review.rating} />
        {review.verifiedPurchase ? <span className="ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Verified Purchase</span> : null}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">{review.comment}</p>
      </div> : null}
      {!open ? <div className="flex flex-wrap gap-4 text-sm">
        <button type="button" onClick={startEdit} className="font-semibold text-emerald-700 underline-offset-4 hover:underline focus-visible:underline dark:text-emerald-300">{review ? "Edit Review" : "Write a Review"}</button>
      </div> : (
        <form onSubmit={submit} className="space-y-3">
          <fieldset disabled={busy}>
            <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">Your rating</legend>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => <label key={value} className="cursor-pointer">
                <input type="radio" className="peer sr-only" name={`rating-${id}`} value={value} checked={rating === value} onChange={() => setRating(value)} required aria-label={`${value} ${value === 1 ? "star" : "stars"}`} />
                <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-lg text-3xl transition hover:bg-emerald-50 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 dark:hover:bg-emerald-950 ${value <= rating ? "text-emerald-700 dark:text-emerald-300" : "text-slate-400 dark:text-slate-500"}`}>{value <= rating ? "★" : "☆"}</span>
              </label>)}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor={`comment-${id}`}>Your review <span className="font-normal">(optional)</span></label>
          <textarea id={`comment-${id}`} rows={3} maxLength={1000} value={comment} disabled={busy} onChange={(event) => setComment(event.target.value)} placeholder="Share your experience with this crop." className="block w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          <p className="text-xs text-slate-500 dark:text-slate-400">{comment.length}/1000 · Plain text only. Your display name and review will be public.</p>
          {error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50">{busy ? "Saving..." : review ? "Save Review" : "Submit Review"}</button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          </div>
        </form>
      )}
      <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{feedback}</p>
    </section>
  );
}
