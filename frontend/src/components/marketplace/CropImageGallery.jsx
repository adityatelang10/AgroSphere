import { useState } from "react";

import { getCropImages } from "../../utils/cropImages";
import CropImage from "./CropImage";

export default function CropImageGallery({ crop }) {
  const images = getCropImages(crop);
  const [selectedUrl, setSelectedUrl] = useState("");
  const activeIndex = Math.max(0, images.findIndex((image) => image.url === selectedUrl));

  return (
    <section aria-label={`${crop.name} image gallery`} className="min-w-0 space-y-3">
      <div className="h-64 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 sm:h-80">
        <CropImage src={images[activeIndex]?.url} alt={`${crop.name} image ${activeIndex + 1}`} className="h-full w-full object-contain" />
      </div>
      {images.length > 1 ? (
        <div role="group" aria-label="Choose crop image" className="flex max-w-full gap-3 overflow-x-auto p-1">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setSelectedUrl(image.url)}
              aria-label={`Show ${crop.name} image ${index + 1}`}
              aria-pressed={index === activeIndex}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-slate-800 ${index === activeIndex ? "border-emerald-600" : "border-transparent"}`}
            >
              <CropImage src={image.url} alt={`${crop.name} thumbnail ${index + 1}`} />
            </button>
          ))}
        </div>
      ) : null}
      {images.length ? <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">Image {activeIndex + 1} of {images.length}</p> : null}
    </section>
  );
}
