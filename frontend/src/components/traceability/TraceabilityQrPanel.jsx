import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";

import { getPublicTraceUrl } from "../../utils/traceability";

const getDownloadName = (cropName) => {
  const safeName = String(cropName || "crop")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeName || "crop"}-traceability-qr.png`;
};

export default function TraceabilityQrPanel({ traceabilityId, cropName, compact = false }) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copy link");
  const publicUrl = getPublicTraceUrl(traceabilityId);

  useEffect(() => {
    let isCurrent = true;

    const createQrCode = async () => {
      setQrDataUrl("");
      setQrError("");

      if (!publicUrl) {
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(publicUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: compact ? 220 : 288,
          color: {
            dark: "#0f3d2e",
            light: "#ffffff",
          },
        });

        if (isCurrent) {
          setQrDataUrl(dataUrl);
        }
      } catch (error) {
        if (isCurrent) {
          setQrError("The QR image could not be generated.");
        }
      }
    };

    createQrCode();

    return () => {
      isCurrent = false;
    };
  }, [compact, publicUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyStatus("Link copied");
      window.setTimeout(() => setCopyStatus("Copy link"), 1800);
    } catch (error) {
      setCopyStatus("Copy failed");
    }
  };

  return (
    <div className={`grid items-center gap-5 ${compact ? "sm:grid-cols-[220px,1fr]" : "md:grid-cols-[288px,1fr]"}`}>
      <div className="mx-auto flex aspect-square w-full max-w-72 items-center justify-center rounded-3xl border border-emerald-100 bg-white p-3 shadow-sm dark:border-emerald-950">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code for ${cropName || "crop"} traceability record`}
            className="h-full w-full rounded-2xl object-contain"
          />
        ) : qrError ? (
          <p className="px-4 text-center text-sm text-rose-600 dark:text-rose-300">{qrError}</p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Generating QR code...</p>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
          Permanent listing ID
        </p>
        <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-950 dark:text-slate-50">
          {traceabilityId}
        </p>
        <p className="mt-3 break-all text-xs leading-5 text-slate-500 dark:text-slate-400">
          {publicUrl}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
          >
            {copyStatus}
          </button>
          <Link
            to={`/trace/${traceabilityId}`}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
          >
            View trace record
          </Link>
          {qrDataUrl ? (
            <a
              href={qrDataUrl}
              download={getDownloadName(cropName)}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              Download QR
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-xl bg-slate-400 px-3 py-2 text-xs font-semibold text-white"
            >
              Download QR
            </button>
          )}
        </div>

        <p aria-live="polite" className="sr-only">
          {copyStatus !== "Copy link" ? copyStatus : ""}
        </p>
      </div>
    </div>
  );
}
