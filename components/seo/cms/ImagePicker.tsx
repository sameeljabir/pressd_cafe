"use client";

import { useMemo, useRef, useState } from "react";
import { IMAGE_LIBRARY, imageName } from "@/lib/content/library";

/**
 * Chooses an image from the site's existing image library (public/assets).
 * No uploads and no external links — only files already in the project.
 */
export default function ImagePicker({ value, onChange, label, disabled }: { value: string; onChange: (src: string) => void; label: string; disabled?: boolean }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return IMAGE_LIBRARY.filter((i) => (!s || i.src.toLowerCase().includes(s)) && (!unusedOnly || !i.usedIn.length));
  }, [q, unusedOnly]);
  return (
    <div className="img-row">
      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a local asset */}
      <img className="img-thumb" src={value} alt="" />
      <div className="field">
        <span>{label}</span>
        <code className="small muted wrap-anywhere">{value}</code>
        <div className="chip-row">
          <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => dlg.current?.showModal()}>
            Choose from library
          </button>
        </div>
      </div>
      <dialog ref={dlg} className="picker" aria-label={`Choose ${label}`} onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}>
        <div className="toolbar">
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            <span>Search the image library</span>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. latte, bowl, interior" autoFocus />
          </label>
          <label className="check"><input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} /> Not used on the site yet</label>
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Close</button>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>{shown.length} of {IMAGE_LIBRARY.length} images. New images are added by the developer to the project; uploads are not available here.</p>
        <div className="pick-scroll">
          <div className="pick-grid">
            {shown.map((img) => (
              <button
                key={img.src}
                type="button"
                aria-pressed={img.src === value}
                onClick={() => {
                  onChange(img.src);
                  dlg.current?.close();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a local asset */}
                <img src={img.src} alt="" loading="lazy" />
                <span>{imageName(img.src)} · {img.width}×{img.height}</span>
              </button>
            ))}
          </div>
        </div>
      </dialog>
    </div>
  );
}
