import { useState } from "react";

// Keep the existing crop placeholder even if a stored URL cannot be loaded.
export default function CropImage({ src, alt, className = "h-full w-full object-cover" }) {
  const [failedSource, setFailedSource] = useState(null);

  if (!src || failedSource === src) {
    return (
      <div role="img" aria-label={`${alt}: image unavailable`} className="flex h-full w-full items-center justify-center text-emerald-700/60 dark:text-emerald-300/60">
        <svg viewBox="0 0 24 24" className="h-9 w-9 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21V10M12 14c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7Zm0-2c4.5 0 7-2.5 7-7-4.5 0-7 2.5-7 7Z" />
        </svg>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={() => setFailedSource(src)} />;
}
