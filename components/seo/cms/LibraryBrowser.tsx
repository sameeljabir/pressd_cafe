"use client";

import { useMemo, useState } from "react";
import { IMAGE_LIBRARY, imageName } from "@/lib/content/library";

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

/** Browse the site's existing images. Read-only: images are chosen from here in the page and menu editors. */
export default function LibraryBrowser({ assigned }: { assigned: Record<string, string[]> }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const [open, setOpen] = useState<string | null>(null);
  const used = (src: string) => IMAGE_LIBRARY.find((i) => i.src === src)!.usedIn.length > 0 || !!assigned[src]?.length;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return IMAGE_LIBRARY.filter((i) => (!s || i.src.toLowerCase().includes(s)) && (filter === "all" || (filter === "used") === used(i.src)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `used` only reads props captured below
  }, [q, filter, assigned]);
  const unusedCount = IMAGE_LIBRARY.filter((i) => !used(i.src)).length;
  return (
    <>
      <div className="toolbar">
        <label className="field" style={{ flex: "1 1 240px" }}><span>Search</span><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="File name, e.g. latte" /></label>
        <div className="seg" role="group" aria-label="Show">
          {(["all", "used", "unused"] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? "on" : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? `All (${IMAGE_LIBRARY.length})` : f === "used" ? "Used" : `Not used (${unusedCount})`}
            </button>
          ))}
        </div>
      </div>
      <div className="lib-grid">
        {shown.map((img) => (
          <div className="lib-card" key={img.src}>
            <button type="button" className="link-btn" style={{ textDecoration: "none" }} onClick={() => setOpen(img.src)} aria-label={`Preview ${imageName(img.src)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
              <img src={img.src} alt="" loading="lazy" />
            </button>
            <b>{imageName(img.src)}</b>
            <code>{img.src}</code>
            <span className="muted">{img.width}×{img.height} · {kb(img.bytes)}</span>
            {assigned[img.src]?.length ? <span className="tag tag-good">{assigned[img.src].join(", ")}</span> : null}
            {img.usedIn.length ? <span className="faint">In code: {img.usedIn.map((f) => f.split("/").pop()).join(", ")}</span> : !assigned[img.src]?.length ? <span className="tag">not used</span> : null}
          </div>
        ))}
      </div>
      {!shown.length ? <p className="muted">No images match.</p> : null}
      {open ? (
        <dialog open className="picker" aria-label="Image preview" style={{ position: "fixed", inset: 0, margin: "auto", zIndex: 50 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
          <img src={open} alt="" style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: 6 }} />
          <p className="small mono wrap-anywhere">{open}</p>
          <button type="button" className="btn" onClick={() => setOpen(null)} autoFocus>Close</button>
        </dialog>
      ) : null}
    </>
  );
}
