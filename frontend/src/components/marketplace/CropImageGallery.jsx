import { useState } from "react";

import { getCropImages } from "../../utils/cropImages";
import CropImage from "./CropImage";
import "../../styles/imageCarousel.css";

export default function CropImageGallery({ crop }) {
  const images = getCropImages(crop);
  const [selection, setSelection] = useState({ url: "", previousUrl: "" });
  const activeIndex = Math.max(0, images.findIndex((image) => image.url === selection.url));
  const select = (index) => {
    if (index === activeIndex) return;
    setSelection({ url: images[index].url, previousUrl: images[activeIndex]?.url || "" });
  };
  const step = (direction) => {
    if (images.length < 2) return;
    setSelection((current) => {
      const index = Math.max(0, images.findIndex((image) => image.url === current.url));
      return { url: images[(index + direction + images.length) % images.length].url, previousUrl: images[index].url };
    });
  };
  const handleKey = (event) => {
    if (images.length < 2 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); step(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <section aria-label={`${crop.name} image gallery`} aria-roledescription="carousel" className="ag-image-carousel min-w-0 space-y-3" onKeyDown={handleKey}>
      <div tabIndex={images.length > 1 ? 0 : undefined} role="group" aria-label={images.length > 1 ? "Image viewer. Use left and right arrow keys to change image." : "Image viewer"}
        className="ag-carousel-frame relative h-64 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 sm:h-80">
        {selection.previousUrl && images.some((image) => image.url === selection.previousUrl) ? <div key={`previous-${images[activeIndex]?.url}`} aria-hidden="true" className="ag-carousel-previous absolute inset-0">
          <CropImage src={selection.previousUrl} alt="" className="h-full w-full object-contain" />
        </div> : null}
        <div key={images[activeIndex]?.url || "placeholder"} className={`ag-carousel-current h-full w-full${selection.previousUrl ? " is-changing" : ""}`}>
          <div className="ag-carousel-image h-full w-full"><CropImage src={images[activeIndex]?.url} alt={`${crop.name} image ${activeIndex + 1}`} className="h-full w-full object-contain" /></div>
        </div>
        {images.length > 1 ? <>
          <button type="button" aria-label="Previous image" className="ag-carousel-arrow is-previous" onClick={() => step(-1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" aria-label="Next image" className="ag-carousel-arrow is-next" onClick={() => step(1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="ag-carousel-counter" aria-hidden="true">{activeIndex + 1} / {images.length}</span>
        </> : null}
      </div>
      {images.length > 1 ? (
        <div role="group" aria-label="Choose crop image" className="flex max-w-full gap-3 overflow-x-auto p-1">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => select(index)}
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
