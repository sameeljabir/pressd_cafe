"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client";
import { buildJsonLd, effectiveBusiness, validateBusiness, type BusinessInfo, type OpeningRow } from "@/lib/seo/core/business";
import { MetadataValidationError } from "@/lib/seo/core/metadata";

type Text = Exclude<keyof BusinessInfo, "servesCuisine" | "openingHours">;
const FIELDS: { k: Text; label: string; hint?: string; type?: string }[][] = [
  [{ k: "name", label: "Business name" }, { k: "url", label: "Website address", hint: "https://…", type: "url" }],
  [{ k: "telephone", label: "Phone", hint: "e.g. +971 4 123 4567", type: "tel" }, { k: "email", label: "Email", type: "email" }],
  [{ k: "priceRange", label: "Price range", hint: "e.g. AED 18-65" }],
];
const ADDRESS: { k: Text; label: string; hint?: string }[] = [
  { k: "streetAddress", label: "Street" },
  { k: "addressLocality", label: "Area" },
  { k: "addressRegion", label: "City / region" },
  { k: "postalCode", label: "Postal code" },
  { k: "addressCountry", label: "Country code", hint: "Two letters, e.g. AE" },
  { k: "latitude", label: "Latitude", hint: "e.g. 25.1600" },
  { k: "longitude", label: "Longitude", hint: "e.g. 55.3000" },
];

function errorOf(b: BusinessInfo): { field: string; message: string } | null {
  try {
    validateBusiness(b as unknown as Record<string, unknown>);
    return null;
  } catch (e) {
    return e instanceof MetadataValidationError ? { field: e.field, message: e.message } : { field: "_", message: "Invalid" };
  }
}

export default function BusinessEditor({ published, draft, canDraft, warnings }: { published: Partial<BusinessInfo> | null; draft: Partial<BusinessInfo> | null; canDraft: boolean; warnings: string[] }) {
  const router = useRouter();
  const baseline = useMemo(() => effectiveBusiness(draft ?? published), [draft, published]);
  const [b, setB] = useState<BusinessInfo>(baseline);
  const [cuisine, setCuisine] = useState(baseline.servesCuisine.join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const current: BusinessInfo = { ...b, servesCuisine: cuisine.split(",").map((c) => c.trim()).filter(Boolean) };
  const dirty = JSON.stringify(current) !== JSON.stringify(baseline);
  const err = errorOf(current);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k: Text) => (e: React.ChangeEvent<HTMLInputElement>) => setB((x) => ({ ...x, [k]: e.target.value }));
  const setRow = (i: number, patch: Partial<OpeningRow>) => setB((x) => ({ ...x, openingHours: x.openingHours.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const input = (f: { k: Text; label: string; hint?: string; type?: string }) => (
    <div className="field" key={f.k}>
      <label htmlFor={`b-${f.k}`}>{f.label}</label>
      <input id={`b-${f.k}`} className="input" type={f.type ?? "text"} value={b[f.k]} placeholder={f.hint} disabled={!canDraft} onChange={set(f.k)} aria-invalid={err?.field === f.k ? true : undefined} aria-errormessage={err?.field === f.k ? "b-err" : undefined} />
      {err?.field === f.k ? <span id="b-err" className="field-error" role="alert">{err.message}</span> : null}
    </div>
  );

  async function save() {
    setBusy(true);
    const r = await api("POST", "/api/admin/seo/drafts", { key: "@business", fields: current });
    setBusy(false);
    setMsg(r.ok ? { text: "Saved as a draft. Use Confirm & Publish (top bar) to put it on the website." } : { text: r.error ?? "Could not save", error: true });
    if (r.ok) router.refresh();
  }

  return (
    <div className="editor-form">
      {warnings.length ? (
        <div className="notice"><h3>Worth checking</h3><ul className="warn-list" style={{ margin: 0 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
      ) : null}
      <fieldset className="card" disabled={!canDraft}>
        <legend>Basics</legend>
        {FIELDS.map((row, i) => <div className="form-row" key={i}>{row.map(input)}</div>)}
        <div className="field">
          <label htmlFor="b-cuisine">Cuisine</label>
          <input id="b-cuisine" className="input" value={cuisine} placeholder="Comma-separated, e.g. Healthy, Breakfast, Coffee" onChange={(e) => setCuisine(e.target.value)} />
        </div>
      </fieldset>
      <fieldset className="card" disabled={!canDraft}>
        <legend>Address</legend>
        <div className="form-row">{ADDRESS.map(input)}</div>
      </fieldset>
      <fieldset className="card" disabled={!canDraft}>
        <legend>Opening hours</legend>
        <p className="small muted" style={{ margin: 0 }}>Days use two letters: Mo Tu We Th Fr Sa Su — ranges like <code>Mo-Th</code> or lists like <code>Sa,Su</code>. Closing at midnight: 00:00.</p>
        {b.openingHours.map((r, i) => (
          <div className="hours-row" key={i}>
            <label className="field"><span>Days</span><input className="input" value={r.days} onChange={(e) => setRow(i, { days: e.target.value })} aria-invalid={err?.field === `openingHours.${i}` ? true : undefined} /></label>
            <label className="field"><span>Opens</span><input className="input" type="time" value={r.opens} onChange={(e) => setRow(i, { opens: e.target.value })} /></label>
            <label className="field"><span>Closes</span><input className="input" type="time" value={r.closes} onChange={(e) => setRow(i, { closes: e.target.value })} /></label>
            <button type="button" className="btn btn-sm" onClick={() => setB((x) => ({ ...x, openingHours: x.openingHours.filter((_, j) => j !== i) }))} aria-label={`Remove hours row ${i + 1}`}>Remove</button>
            {err?.field === `openingHours.${i}` ? <span className="field-error" role="alert">{err.message}</span> : null}
          </div>
        ))}
        {b.openingHours.length < 7 ? <button type="button" className="btn btn-sm" onClick={() => setB((x) => ({ ...x, openingHours: [...x.openingHours, { days: "", opens: "07:00", closes: "23:00" }] }))}>Add hours row</button> : null}
      </fieldset>
      <details className="card">
        <summary>Structured data preview (JSON-LD)</summary>
        <pre className="mono small wrap-anywhere" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(err ? buildJsonLd(baseline) : buildJsonLd(current), null, 2)}</pre>
        <p className="small faint">Google reads this from the home page. Keep it the same as your Google Business Profile.</p>
      </details>
      {canDraft ? (
        <div className="action-bar sticky-actions">
          <button type="button" className="btn btn-primary" disabled={!dirty || !!err || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="btn" disabled={!dirty} onClick={() => { setB(baseline); setCuisine(baseline.servesCuisine.join(", ")); }}>Discard changes</button>
          {dirty ? <span className="small" style={{ color: "var(--amber)" }}>Unsaved changes</span> : null}
          {err && err.field.startsWith("servesCuisine") ? <span className="field-error">{err.message}</span> : null}
          {msg ? <span className={msg.error ? "field-error" : "small"} role={msg.error ? "alert" : "status"} style={msg.error ? undefined : { color: "var(--good)" }}>{msg.text}</span> : null}
        </div>
      ) : <p className="hint">Your role can view business info but not change it.</p>}
    </div>
  );
}
