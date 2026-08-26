import { useEffect, useRef, useState } from "react";

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
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          AI Leaf Disease Detection
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Scan a supported crop leaf.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          Upload a clear leaf image. AgroSphere sends it through the authenticated Node API
          to a trained computer-vision model and returns its strongest supported class.
        </p>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-amber-700 dark:text-amber-300">
          This model currently supports selected Bell Pepper, Potato, and Tomato leaf
          conditions only. Unsupported plants or symptoms can still be misclassified as a
          known class.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
        <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Upload a clear image of a crop leaf
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            JPEG, JPG, PNG, or WEBP · maximum 5 MB · one leaf image per scan
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <input
              ref={fileInputRef}
              id="leaf-image"
              type="file"
              aria-label="Leaf image"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            />
            <label
              htmlFor="leaf-image"
              className="flex min-h-72 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border-2 border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center transition hover:border-emerald-500 dark:border-emerald-900 dark:bg-emerald-950/20"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Selected leaf preview"
                  className="max-h-64 w-full rounded-2xl object-contain"
                />
              ) : (
                <>
                  <span className="text-5xl" aria-hidden="true">
                    &#127811;
                  </span>
                  <span className="mt-4 font-semibold text-emerald-800 dark:text-emerald-300">
                    Choose a leaf image
                  </span>
                  <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Use a focused photo with the affected leaf clearly visible.
                  </span>
                </>
              )}
            </label>

            {imageFile ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900">
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
                  className="text-xs font-semibold text-rose-600 hover:text-rose-500"
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
              className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Analyzing leaf image..." : "Analyze leaf"}
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-slate-950 p-6 text-white shadow-xl dark:border-slate-800">
          {!result ? (
            <div className="flex min-h-[34rem] flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
                Supported scope
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold">
                15 crop-condition classes
              </h2>
              <div className="mt-6 space-y-4">
                {SUPPORTED_CLASS_GROUPS.map((group) => (
                  <article key={group.crop} className="rounded-2xl bg-white/5 p-4">
                    <h3 className="font-semibold text-white">{group.crop}</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-400">
                      {group.conditions.join(" · ")}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
                Detected condition
              </p>
              <h2 className="mt-3 font-display text-4xl font-bold">
                {result.crop} — {result.condition}
              </h2>
              <span
                className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  result.isHealthy
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-amber-500/20 text-amber-200"
                }`}
              >
                {result.isHealthy ? "Healthy supported class" : "Disease class detected"}
              </span>

              <article className="mt-7 rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">Model confidence</p>
                <p className="mt-2 font-display text-4xl font-bold text-lime-300">
                  {formatConfidence(result.confidence)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  This score is for one prediction; it is not overall test accuracy.
                </p>
              </article>

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

              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Cautious next step
                </p>
                <p className="mt-2 text-sm leading-7 text-emerald-100">{result.guidance}</p>
              </div>

              <p className="mt-6 text-xs leading-6 text-amber-200">
                This AI result is decision support only. Similar visual symptoms can have
                multiple causes, so confirm important treatment decisions with local
                agricultural expertise. The model cannot recognize every crop or disease.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
