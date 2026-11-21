"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../client";
import { IMAGE_LIBRARY, imageName } from "@/lib/content/library";
import type { MediaItem } from "@/lib/blog/mediaStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (src: string) => void;
  canUpload: boolean;
  title?: string;
}

/** Choose an uploaded image or one from the site's image library, or upload a new one. */
export default function MediaPicker({ open, onClose, onPick, canUpload, title = "Choose an image" }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"uploads" | "library">("uploads");
  const [uploads, setUploads] = useState<MediaItem[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // open/close the native dialog with the prop
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      if (uploads === null)
        void api<{ media: MediaItem[] }>("GET", "/api/admin/seo/media").then((r) => (r.ok && r.data ? setUploads(r.data.media) : setError(r.error ?? "Could not load uploads")));
    } else if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to open/close
  }, [open]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/seo/media", { method: "POST", body: fd, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { media?: MediaItem; error?: { message?: string } } | null;
      if (!res.ok || !json?.media) throw new Error(res.status === 401 ? "Your session has expired — reload to sign in." : json?.error?.message ?? `Upload failed (${res.status})`);
      setUploads((u) => [json.media!, ...(u ?? []).filter((x) => x.id !== json.media!.id)]);
      onPick(json.media.src);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const lib = useMemo(() => {
    const s = q.trim().toLowerCase();
    return IMAGE_LIBRARY.filter((i) => !s || i.src.toLowerCase().includes(s)).slice(0, 300);
  }, [q]);

  return (
    <dialog ref={dlg} className="picker" aria-label={title} onClose={onClose} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="toolbar">
        <h2 className="section grow" style={{ margin: 0 }}>{title}</h2>
        <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      <div className="toolbar">
        <span className="seg" role="tablist" aria-label="Image source">
          <button type="button" role="tab" aria-selected={tab === "uploads"} className={tab === "uploads" ? "on" : ""} onClick={() => setTab("uploads")}>Uploads</button>
          <button type="button" role="tab" aria-selected={tab === "library"} className={tab === "library" ? "on" : ""} onClick={() => setTab("library")}>Site image library</button>
        </span>
        {canUpload ? (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" id="media-upload" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <label htmlFor="media-upload" className={`btn btn-primary btn-sm ${busy ? "is-busy" : ""}`} aria-disabled={busy}>{busy ? "Uploading…" : "Upload image"}</label>
          </>
        ) : null}
        {tab === "library" ? <input className="input grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: latte, bowl, interior…" aria-label="Search the image library" /> : null}
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>JPEG, PNG, WebP or GIF up to 5 MB. Landscape images around 1600 px wide work best for covers.</p>
      {error ? <div className="notice notice-error" role="alert"><p>{error}</p></div> : null}
      <div className="pick-scroll">
        {tab === "uploads" ? (
          uploads === null ? <p className="small muted">Loading…</p> : uploads.length ? (
            <div className="pick-grid">
              {uploads.map((m) => (
                <button key={m.id} type="button" onClick={() => { onPick(m.src); onClose(); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                  <img src={m.src} alt="" loading="lazy" />
                  <span>{m.width}×{m.height} · {Math.round(m.bytes / 1024)} KB</span>
                </button>
              ))}
            </div>
          ) : <div className="empty">No uploads yet.{canUpload ? " Use “Upload image”." : ""}</div>
        ) : (
          <div className="pick-grid">
            {lib.map((img) => (
              <button key={img.src} type="button" onClick={() => { onPick(img.src); onClose(); }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a local asset */}
                <img src={img.src} alt="" loading="lazy" />
                <span>{imageName(img.src)} · {img.width}×{img.height}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
