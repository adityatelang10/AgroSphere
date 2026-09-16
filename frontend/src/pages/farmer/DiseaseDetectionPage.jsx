import { useEffect, useRef, useState } from "react";

import ModuleHeader from "../../components/ui/ModuleHeader";
import ScrollReveal from "../../components/ui/ScrollReveal";
import useResultReveal from "../../hooks/useResultReveal";
import { requestDiseaseDetection } from "../../services/diseaseDetectionService";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SUPPORTED_CLASS_GROUPS = [
  {
    crop: "Bell Pepper",
    conditions: ["Bacterial Spot", "Healthy"],
  },
  {
    crop: "Potato",
    conditions: ["Early Blight", "Late Blight", "Healthy"],
  },
  {
    crop: "Tomato",
    conditions: [
      "Bacterial Spot",
      "Early Blight",
      "Late Blight",
      "Leaf Mold",
      "Septoria Leaf Spot",
      "Two-Spotted Spider Mite",
      "Target Spot",
      "Yellow Leaf Curl Virus",
      "Mosaic Virus",
      "Healthy",
    ],
  },
];

const formatConfidence = (confidence) =>
  new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Number(confidence) || 0);

export default function DiseaseDetectionPage() {
  const fileInputRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resultRef = useResultReveal(result);

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl]
  );

  const selectImage = (file) => {
    setResult(null);
    setError("");

    if (!file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setImageFile(null);
      setPreviewUrl("");
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageFile(null);
      setPreviewUrl("");
      setError("Select a JPEG, JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size <= 0) {
      setImageFile(null);
      setPreviewUrl("");
      setError("The selected image is empty.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageFile(null);
      setPreviewUrl("");
      setError("The leaf image must not exceed 5 MB.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileChange = (event) => {
    selectImage(event.target.files?.[0] || null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!imageFile) {
      setError("Select a clear leaf image before starting the scan.");
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setResult(null);

    try {
      const response = await requestDiseaseDetection(imageFile);
      setResult(response);
    } catch (requestError) {
      if (requestError.status === 503) {
        setError(
          "Disease detection service is currently unavailable. Please try again later."
        );
      } else {
        setError(requestError.message || "We could not analyze this leaf image.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Leaf Scanner"
        category="Deep Learning Classification"
        method="MobileNetV2"
        icon="leaf"
        tone="diagnostic"
        description="Upload a clear crop-leaf photo for classification against the model’s supported crop-condition classes."
      >
        <p className="max-w-4xl text-xs leading-6 text-amber-700 dark:text-amber-300">
          This model currently supports selected Bell Pepper, Potato, and Tomato leaf
          conditions only. A feature-space guard rejects sufficiently dissimilar images;
          unsupported plants or symptoms can still pass it and be misclassified.
        </p>
      </ModuleHeader>

      <ScrollReveal
        as="section"
        className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-cyan-200/80 bg-white/90 shadow-lg dark:border-cyan-950 dark:bg-slate-950/80"
      >
        <div className="border-b border-cyan-100 bg-cyan-50/70 px-5 py-4 dark:border-cyan-950 dark:bg-cyan-950/20 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
                Visual diagnostic workspace
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
                Upload leaf image → preview → classification
              </h2>
            </div>
            <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-800 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200">
              JPEG · PNG · WEBP · max 5 MB
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-4 sm:p-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Supported: Bell Pepper, Potato and Tomato leaf photos. Upload one clear leaf image.
            </p>
            <input
              ref={fileInputRef}
              id="leaf-image"
              type="file"
              aria-label="Leaf image"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="sr-only"
            />
            <div className="relative flex min-h-[18rem] flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-4 text-center dark:border-cyan-900 dark:from-cyan-950/30 dark:via-slate-950 dark:to-emerald-950/20 sm:min-h-[20rem]">
              {previewUrl ? (
                <>
                  <img
                    src={previewUrl}
                    alt="Selected leaf preview"
                    className="max-h-[17rem] w-full rounded-2xl object-contain sm:max-h-[19rem]"
                  />
                  <span className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-cyan-400/70 shadow-[0_0_18px_rgba(34,211,238,0.8)]" aria-hidden="true" />
                </>
              ) : (
                <>
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200 bg-white text-cyan-700 shadow-sm dark:border-cyan-900 dark:bg-slate-900 dark:text-cyan-300" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-8 w-8">
                      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                    </svg>
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                    Select a leaf image
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Use a focused photo with one supported crop leaf clearly visible.
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                className="relative mt-3 rounded-full bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950"
              >
                {previewUrl ? "Choose another image" : "Browse image"}
              </button>
            </div>

            {imageFile ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                    {imageFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(imageFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                    selectImage(null);
                  }}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:hover:bg-rose-950/30"
                >
                  Remove
                </button>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mx-auto block w-full max-w-sm rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-cyan-700 dark:hover:bg-cyan-600 dark:focus-visible:ring-offset-slate-950"
            >
              {isSubmitting ? "Analyzing leaf image..." : "Analyze Leaf"}
            </button>
          </form>
      </ScrollReveal>

      {result?.status === "UNSUPPORTED_IMAGE" ? (
        <section ref={resultRef} role="status" className="mx-auto w-full max-w-5xl scroll-mt-24 rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
            Unable to analyze this image
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-300">{result.message}</p>
          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            No diagnosis was saved. Supported: Bell Pepper, Potato and Tomato leaf photos.
          </p>
        </section>
      ) : null}

      {result?.status === "CLASSIFIED" ? (
        <div ref={resultRef} className="scroll-mt-24 border-t border-slate-200 pt-6 dark:border-slate-800">
          <ScrollReveal
            as="section"
            className="mx-auto w-full max-w-5xl rounded-3xl bg-slate-950 p-5 text-white shadow-xl sm:p-6"
          >
            <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
              <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                Detection result
              </p>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{result.crop}</p>
              <h2 className="mt-1 font-display text-4xl font-bold sm:text-5xl">{result.condition}</h2>
              <span
                className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  result.isHealthy
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-amber-500/20 text-amber-200"
                }`}
              >
                {result.isHealthy ? "Healthy supported class" : "Disease class detected"}
              </span>

              <article className="mt-7 rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-5">
                <p className="text-sm text-slate-400">Model confidence</p>
                <p className="mt-2 font-display text-4xl font-bold text-cyan-300">
                  {formatConfidence(result.confidence)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Classification strength for this image; not disease severity or overall test accuracy.
                </p>
              </article>
              </div>

              <div>
              <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm leading-7 text-slate-300">
                <p>
                  <span className="text-slate-500">Model:</span> {result.modelVersion}
                </p>
                <p className="break-words">
                  <span className="text-slate-500">Class:</span> {result.predictedClass}
                </p>
                <p>
                  <span className="text-slate-500">Scope:</span>{" "}
                  {result.supportedClassCount} supported classes across{" "}
                  {result.supportedCrops.join(", ")}
                </p>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {SUPPORTED_CLASS_GROUPS.map((group) => (
                  <article key={group.crop} className="rounded-2xl border border-slate-800 bg-white/5 p-3">
                    <h3 className="text-sm font-semibold text-white">{group.crop}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {group.conditions.length} supported classes
                    </p>
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  Cautious next step
                </p>
                <p className="mt-2 text-sm leading-7 text-cyan-100">{result.guidance}</p>
              </div>

              <p className="mt-6 text-xs leading-6 text-amber-200">
                This AI result is decision support only. Similar visual symptoms can have
                multiple causes, so confirm important treatment decisions with local
                agricultural expertise. The model cannot recognize every crop or disease.
              </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      ) : null}
    </div>
  );
}
