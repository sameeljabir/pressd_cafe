"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "./client";
import { ALT_MAX, altStatus, effectiveAlts, type AltStatus } from "@/lib/seo/core/images";
import { SITE_IMAGES, SITE_SECTIONS, type SectionId } from "@/lib/siteImages";

const STATUS_TEXT: Record<AltStatus, string> = { missing: "Missing", short: "Too short — describe the photo", good: "Good", decorative: "Decorative (hidden from screen readers)" };

export default function ImagesEditor({
  sections,
  published,
  draft,
  canDraft,
  filterable = false,
  linkToPage = false,
}: {
  sections?: SectionId[];
  published: Record<string, string> | null;
  draft: Record<string, string> | null;
  canDraft: boolean;
  filterable?: boolean;
  linkToPage?: boolean;
}) {
  const router = useRouter();
  const baseline = useMemo(() => effectiveAlts(draft ?? published), [draft, published]);
  const live = useMemo(() => effectiveAlts(published), [published]);
  const [work, setWork] = useState<Record<string, string>>(baseline);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const dirty = SITE_IMAGES.some((i) => (work[i.key] ?? "").trim() !== (baseline[i.key] ?? "").trim());
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const inScope = SITE_IMAGES.filter((i) => !sections || sections.includes(i.section));
  const attention = inScope.filter((i) => ["missing", "short"].includes(altStatus(work[i.key] ?? "", i.alt === "")));
  const visible = filter === "attention" ? attention : inScope;
  const tooLong = inScope.filter((i) => (work[i.key] ?? "").length > ALT_MAX);
  const unsafe = inScope.filter((i) => /[<>]/.test(work[i.key] ?? ""));

  async function save() {
    setBusy(true);
    const r = await api("POST", "/api/admin/seo/drafts", { key: "@images", fields: work });
    setBusy(false);
    setMsg(r.ok ? { text: "Saved as a draft. Use Confirm & Publish (top bar) to put it on the website." } : { text: r.error ?? "Could not save", error: true });
    if (r.ok) router.refresh();
  }

  return (
    <div className="images-editor">
      {filterable ? (
        <div className="seg seg-lg" role="group" aria-label="Filter images">
          <button type="button" className={filter === "all" ? "on" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All images ({inScope.length})</button>
          <button type="button" className={filter === "attention" ? "on" : ""} aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Missing or too short ({attention.length})</button>
        </div>
      ) : null}
      {SITE_SECTIONS.filter((s) => visible.some((i) => i.section === s.id)).map((s) => (
        <section className="card" key={s.id} aria-labelledby={`img-${s.id}`}>
          <div className="card-head">
            <h2 className="section" id={`img-${s.id}`}>{s.label}</h2>
            {linkToPage ? <Link className="small" href={`/admin/seo/pages?path=%2F&tab=${s.id}`}>Edit on page →</Link> : null}
          </div>
          {visible.filter((i) => i.section === s.id).map((i) => {
            const value = work[i.key] ?? "";
            const st = altStatus(value, i.alt === "");
            const changed = value.trim() !== live[i.key];
            return (
              <div className="img-row" key={i.key}>
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of the site's own image */}
                <img className="img-thumb" src={i.src} alt="" loading="lazy" />
                <div className="field">
                  <label htmlFor={`alt-${i.key}`}>{i.label}</label>
                  <input
                    id={`alt-${i.key}`}
                    className="input"
                    value={value}
                    maxLength={ALT_MAX + 50}
                    disabled={!canDraft}
                    placeholder={i.alt === "" ? "Decorative — leave empty" : "Describe what the photo shows"}
                    aria-describedby={`alt-st-${i.key}`}
                    aria-invalid={value.length > ALT_MAX || /[<>]/.test(value) ? true : undefined}
                    onChange={(e) => setWork((w) => ({ ...w, [i.key]: e.target.value }))}
                  />
                  <span id={`alt-st-${i.key}`} className={`meter meter-${st === "good" || st === "decorative" ? "good" : st === "short" ? "short" : "long"}`}>
                    <span>{STATUS_TEXT[st]}{changed ? " · changed (not live)" : ""}</span>
                    <span className="num">{value.trim().length} chars</span>
                  </span>
                  {value.trim() !== i.alt && canDraft ? (
                    <button type="button" className="link-btn small" onClick={() => setWork((w) => ({ ...w, [i.key]: i.alt }))}>Reset to original text</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      {!visible.length ? <div className="empty">Every image has good alt text. 🎉</div> : null}
      {canDraft ? (
        <div className="action-bar sticky-actions">
          <button type="button" className="btn btn-primary" disabled={!dirty || busy || tooLong.length > 0 || unsafe.length > 0} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="btn" disabled={!dirty} onClick={() => setWork(baseline)}>Discard changes</button>
          {dirty ? <span className="small" style={{ color: "var(--amber)" }}>Unsaved changes</span> : null}
          {tooLong.length ? <span className="field-error">Alt text is limited to {ALT_MAX} characters.</span> : null}
          {unsafe.length ? <span className="field-error">Angle brackets are not allowed.</span> : null}
          {msg ? <span className={msg.error ? "field-error" : "small"} role={msg.error ? "alert" : "status"} style={msg.error ? undefined : { color: "var(--good)" }}>{msg.text}</span> : null}
        </div>
      ) : <p className="hint">Your role can view alt text but not change it.</p>}
      <p className="small faint">Menu item photos use each product&apos;s name as their alt text; change it in the menu data.</p>
    </div>
  );
}
