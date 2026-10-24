"use client";

import { useRef, useState } from "react";
import { useAlt } from "@/components/AltTextContext";

const IMAGES = [
  { key: "gallery.coffee", src: "/assets/coffee-matcha.webp" },
  { key: "gallery.bowl", src: "/assets/power-bowl.webp" },
  { key: "gallery.smoothies", src: "/assets/smoothies.webp" },
  { key: "gallery.toast", src: "/assets/avocado-toast.webp" },
];

export default function GallerySection() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<{ key: string; src: string } | null>(null);
  const alt = useAlt();

  const open = (image: { key: string; src: string }) => {
    setActive(image);
    dialogRef.current?.showModal();
  };

  return (
    <>
      <section className="gallery section">
        <div className="gallery-head">
          <div>
            <p className="eyebrow">FROM OUR TABLE</p>
            <h2>
              THE GOOD
              <br />
              <em>STUFF.</em>
            </h2>
          </div>
          <p>
            @pressd.cafe
            <br />
            Meydan Polo Residence, Dubai
          </p>
        </div>
        <div className="gallery-grid">
          {IMAGES.map((image) => (
            <button key={image.src} onClick={() => open(image)}>
              <img src={image.src} alt={alt(image.key)} loading="lazy" />
            </button>
          ))}
        </div>
      </section>
      <dialog
        className="lightbox"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <button className="dialog-close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
          ×
        </button>
        {active && <img src={active.src} alt={alt(active.key)} />}
      </dialog>
    </>
  );
}
