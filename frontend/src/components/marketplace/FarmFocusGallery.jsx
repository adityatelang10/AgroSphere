import { useState } from "react";

import { getCropImages } from "../../utils/cropImages";
import CropImage from "./CropImage";
import "../../styles/farmFocusGallery.css";

// Kept separate from the crop-detail viewer: this presentation is for farm photos only.
export default function FarmFocusGallery({ name, images: photos }) {
  const images = getCropImages({ images: photos });
  const [selectedUrl, setSelectedUrl] = useState("");
  const activeIndex = Math.max(0, images.findIndex((image) => image.url === selectedUrl));
  const count = images.length;
  const step = (direction) => {
    if (count < 2) return;
    setSelectedUrl((current) => {
      const index = Math.max(0, images.findIndex((image) => image.url === current));
      return images[(index + direction + count) % count].url;
    });
  };
  const handleKey = (event) => {
    if (count < 2 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  };

  if (!count) return null;

  return (
    <section className="ag-farm-focus" aria-label={`${name} image gallery`} aria-roledescription="carousel" onKeyDown={handleKey}>
      <div className={`ag-farm-focus-stage${count === 2 ? " has-two" : ""}`} role="group"
        tabIndex={count > 1 ? 0 : undefined}
        aria-label={count > 1 ? "Farm photos. Use left and right arrow keys to change image." : "Farm photo"}>
        {images.map((image, index) => {
          const active = index === activeIndex;
          // With two photos show the other photo just once, on the right.
          const previous = count > 2 && index === (activeIndex - 1 + count) % count;
          const next = count > 1 && index === (activeIndex + 1) % count;
          const visible = active || previous || next;
          const position = active ? "active" : previous ? "previous" : next ? "next" : "away";
          return (
            <div key={image.url} className={`ag-farm-focus-slide is-${position}`} aria-hidden={!visible || undefined}>
              <CropImage src={image.url} alt={active ? `${name} image ${index + 1}` : ""} className="ag-farm-focus-photo" />
              {count > 1 ? <button type="button" className="ag-farm-focus-select"
                aria-label={`Focus ${name} image ${index + 1}`} aria-pressed={active}
                tabIndex={visible ? 0 : -1} disabled={!visible}
                onClick={() => setSelectedUrl(image.url)} /> : null}
            </div>
          );
        })}
        {count > 1 ? <>
          <button type="button" aria-label="Previous image" className="ag-farm-focus-arrow is-previous" onClick={() => step(-1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" aria-label="Next image" className="ag-farm-focus-arrow is-next" onClick={() => step(1)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </> : null}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400" aria-live="polite" aria-atomic="true">Image {activeIndex + 1} of {count}</p>
    </section>
  );
}
