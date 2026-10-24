"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "./client";
import {
  effectiveMeta,
  lengthStatus,
  MAX_EXTRA_META,
  OG_TYPES,
  overrideErrors,
  overrideWarnings,
  snippetPreview,
  TWITTER_CARDS,
  validateOverride,
  type EffectiveMeta,
  type ExtraMeta,
  type MetaOverride,
  type Thresholds,
} from "@/lib/seo/core/metadata";

interface Props {
  page: { path: string; url: string; label: string; note: string };
  siteOrigin: string;
  defaults: EffectiveMeta;
  published: { fields: MetaOverride; version: number; publishedBy: string; publishedAt: string } | null;
  draft: { fields: MetaOverride; savedBy: string; savedAt: string } | null;
  thresholds: Thresholds;
  canDraft: boolean;
  imageSuggestions: { url: string; label: string }[];
}

interface Form {
  title: string;
  description: string;
  keywords: string;
  keywordsEnabled: boolean;
  canonical: string;
  index: boolean;
  follow: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
  twitterCard: string;
  extraMeta: ExtraMeta[];
}

function toForm(o: MetaOverride | null | undefined): Form {
  const robots = o?.robots ?? "index, follow";
  return {
    title: o?.title ?? "",
    description: o?.description ?? "",
    keywords: o?.keywords ?? "",
    keywordsEnabled: !!o?.keywordsEnabled,
    canonical: o?.canonical ?? "",
    index: robots.startsWith("index"),
    follow: robots.endsWith(" follow"),
    ogTitle: o?.ogTitle ?? "",
    ogDescription: o?.ogDescription ?? "",
    ogImage: o?.ogImage ?? "",
    ogType: o?.ogType ?? "",
    twitterCard: o?.twitterCard ?? "",
    extraMeta: o?.extraMeta?.map((t) => ({ ...t })) ?? [],
  };
}

/** Raw input for validateOverride (same shape the API receives). */
function toInput(f: Form): Record<string, unknown> {
  return {
    title: f.title,
    description: f.description,
    keywords: f.keywords,
    keywordsEnabled: f.keywordsEnabled,
    canonical: f.canonical,
    robots: `${f.index ? "index" : "noindex"}, ${f.follow ? "follow" : "nofollow"}`,
    ogTitle: f.ogTitle,
    ogDescription: f.ogDescription,
    ogImage: f.ogImage,
    ogType: f.ogType,
    twitterCard: f.twitterCard,
    extraMeta: f.extraMeta.filter((t) => t.name.trim() || t.content.trim()),
  };
}

function safeValidate(f: Form, site: URL): MetaOverride | null {
  try {
    return validateOverride(toInput(f), site);
  } catch {
    return null;
  }
}

/** Per-field errors (validates each field on its own so every problem shows at once). */
function fieldErrors(f: Form, site: URL): Record<string, string> {
  const input = toInput(f);
  const errs: Record<string, string> = {};
  for (const k of ["title", "description", "canonical", "ogTitle", "ogDescription", "ogImage", "ogType", "twitterCard"]) Object.assign(errs, overrideErrors({ [k]: input[k] }, site));
  Object.assign(errs, overrideErrors({ keywords: input.keywords, keywordsEnabled: input.keywordsEnabled }, site));
  Object.assign(errs, overrideErrors({ extraMeta: input.extraMeta }, site));
  return errs;
}

/** Lenient preview values while typing (invalid fields fall back to defaults). */
function previewOverride(f: Form, site: URL): MetaOverride {
  const errs = fieldErrors(f, site);
  const input = toInput(f);
  for (const k of Object.keys(errs)) delete input[k.split(".")[0]];
  if (errs.keywords) delete input.keywordsEnabled;
  return safeValidate({ ...toForm({}), ...fromInputLoose(input) }, site) ?? {};
}

function fromInputLoose(i: Record<string, unknown>): Partial<Form> {
  const out: Partial<Form> = {};
  for (const k of ["title", "description", "keywords", "canonical", "ogTitle", "ogDescription", "ogImage", "ogType", "twitterCard"] as const) if (typeof i[k] === "string") out[k] = i[k] as string;
  if (typeof i.keywordsEnabled === "boolean") out.keywordsEnabled = i.keywordsEnabled;
  if (typeof i.robots === "string") {
    out.index = i.robots.startsWith("index");
    out.follow = i.robots.endsWith(" follow");
  }
  if (Array.isArray(i.extraMeta)) out.extraMeta = i.extraMeta as ExtraMeta[];
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const FIELD_LABELS: [keyof EffectiveMeta, string][] = [
  ["title", "Title"],
  ["description", "Description"],
  ["canonical", "Canonical URL"],
  ["robots", "Robots"],
  ["keywords", "Meta keywords"],
  ["ogTitle", "Social title"],
  ["ogDescription", "Social description"],
  ["ogImage", "Social image"],
  ["ogType", "og:type"],
  ["twitterCard", "X card"],
  ["extraMeta", "Additional tags"],
];

const ERROR_LABELS: Record<string, string> = {
  title: "Page title", description: "Meta description", keywords: "Keywords", canonical: "Canonical URL", ogTitle: "Share title",
  ogDescription: "Share description", ogImage: "Share image", ogType: "og:type", twitterCard: "X card", extraMeta: "Additional meta tags",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.map((t: ExtraMeta) => `${t.name}=${t.content}`).join(", ") : "—") : String(v));

function Meter({ len, min, max }: { len: number; min: number; max: number }) {
  const s = lengthStatus(len, min, max);
  const label = { empty: "Using default", short: "A bit short", good: "Good length", long: "Too long" }[s];
  return (
    <span className={`meter meter-${s}`}>
      <span>{label}</span>
      <span className="num">{len} / {max}</span>
    </span>
  );
}

type Notice = { text: string; kind: "good" | "error" | "info" } | null;
interface Notices {
  setMsg: (n: Notice) => void;
}

/**
 * Keeps the status message outside the form: after a save or publish the page
 * data refreshes and the form below remounts with the new values.
 */
export default function SeoEditor(p: Props) {
  const [msg, setMsg] = useState<Notice>(null);
  const formKey = `${p.page.path}:${p.published?.version ?? 0}:${p.draft?.savedAt ?? ""}`;
  return (
    <>
      {msg ? <div className={`notice ${msg.kind === "error" ? "notice-error" : msg.kind === "good" ? "notice-good" : ""}`} role={msg.kind === "error" ? "alert" : "status"}><p>{msg.text}</p></div> : null}
      <EditorForm key={formKey} {...p} setMsg={setMsg} />
    </>
  );
}

function EditorForm(p: Props & Notices) {
  const router = useRouter();
  const site = useMemo(() => new URL(p.siteOrigin), [p.siteOrigin]);
  const baseline = useMemo(() => toForm(p.draft?.fields ?? p.published?.fields), [p.draft, p.published]);
  const [form, setForm] = useState<Form>(baseline);
  const [busy, setBusy] = useState<string | null>(null);
  const { setMsg } = p;
  const [imgError, setImgError] = useState(false);
  // Optional sections open if they already hold values; afterwards only the user toggles them.
  const [keywordsOpen, setKeywordsOpen] = useState(() => !!baseline.keywordsEnabled || !!baseline.keywords);
  const [extraOpen, setExtraOpen] = useState(() => baseline.extraMeta.length > 0);

  const errors = useMemo(() => fieldErrors(form, site), [form, site]);
  const hasErrors = Object.keys(errors).length > 0;
  const valid = useMemo(() => (hasErrors ? null : safeValidate(form, site)), [form, site, hasErrors]);
  const preview = useMemo(() => effectiveMeta(p.defaults, previewOverride(form, site)), [form, site, p.defaults]);
  const live = useMemo(() => effectiveMeta(p.defaults, p.published?.fields ?? null), [p.defaults, p.published]);
  const dirty = !same(toInput(form), toInput(baseline));
  const canSave = p.canDraft && dirty && !hasErrors && !busy;
  const draftPending = !!p.draft && !same(effectiveMeta(p.defaults, p.draft.fields), live);
  const warnings = valid ? overrideWarnings(valid, effectiveMeta(p.defaults, valid), p.thresholds, site, p.page.path) : [];
  const snippet = snippetPreview(preview.title, preview.description);
  // Share images are published as absolute ${site.host} URLs (what social apps need). Until this app
  // serves that domain, those URLs reach the old static site, so the preview loads the file from
  // this deployment instead.
  const previewSrc = (u: string) => {
    const x = new URL(u);
    return x.host === site.host ? x.pathname + x.search : u;
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: "title" | "description" | "keywords" | "canonical" | "ogTitle" | "ogDescription" | "ogImage") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (k === "ogImage") setImgError(false);
    set(k, e.target.value);
  };
  const err = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-errormessage": `err-${k}` } : {});
  const errorText = (k: string) => (errors[k] ? <span id={`err-${k}`} className="field-error" role="alert">{errors[k]}</span> : null);

  async function saveDraft() {
    setBusy("draft");
    const r = await api<{ draft: unknown }>("POST", "/api/admin/seo/drafts", { key: "/", fields: toInput(form) });
    setBusy(null);
    setMsg(r.ok ? { text: "Saved. The website changes when you use Confirm & Publish in the top bar.", kind: "good" } : { text: r.error ?? "Could not save the draft", kind: "error" });
    if (r.ok) router.refresh();
  }

  async function discard() {
    if (p.draft && !dirty) {
      if (!window.confirm("Delete the saved draft and go back to the live values?")) return;
      setBusy("discard");
      const r = await api("DELETE", `/api/admin/seo/drafts?key=${encodeURIComponent("/")}`);
      setBusy(null);
      if (!r.ok) return setMsg({ text: r.error ?? "Could not delete the draft", kind: "error" });
      setForm(toForm(p.published?.fields));
      setMsg({ text: "Draft deleted.", kind: "info" });
      router.refresh();
      return;
    }
    if (window.confirm("Discard your unsaved changes?")) setForm(baseline);
  }

  const robotsTag = (r: string) => (r === "index, follow" ? 'none (default: index, follow)' : `<meta name="robots" content="${r}">`);

  return (
    <div className="editor">
      <div className="status-bar" role="status" aria-live="polite">
        <span className={`dot ${dirty || draftPending ? "dot-amber" : "dot-good"}`} aria-hidden="true" />
        <span>
          {dirty ? <b>Unsaved changes</b> : draftPending ? <b>Saved — not on the website yet</b> : <b>Same as the website</b>}
          <span className="muted">
            {" · "}
            {p.published ? `live version ${p.published.version}, published ${fmtDate(p.published.publishedAt)} by ${p.published.publishedBy}` : "live values are the code defaults"}
            {p.draft && !dirty ? ` · saved ${fmtDate(p.draft.savedAt)} by ${p.draft.savedBy}` : ""}
          </span>
        </span>
      </div>
      <p className="small faint" style={{ marginTop: 0 }}>{p.page.note}</p>

      <div className="editor-grid">
        <form className="editor-form" onSubmit={(e) => { e.preventDefault(); if (canSave) void saveDraft(); }} aria-label={`SEO tags for ${p.page.url}`} noValidate>
          <fieldset disabled={!p.canDraft} className="card">
            <legend>Search result</legend>
            <div className="field">
              <label htmlFor="f-title">Page title</label>
              <span className="hint" id="h-title">The blue link on Google and the browser tab. Empty = default.</span>
              <input id="f-title" className="input" maxLength={120} placeholder={p.defaults.title} value={form.title} onChange={text("title")} aria-describedby="h-title" {...err("title")} />
              <Meter len={(form.title || p.defaults.title).length} min={p.thresholds.titleMin} max={p.thresholds.titleMax} />
              {errorText("title")}
            </div>
            <div className="field">
              <label htmlFor="f-desc">Meta description</label>
              <span className="hint" id="h-desc">The grey text under the link. Search engines may show different text.</span>
              <textarea id="f-desc" className="input" rows={3} maxLength={320} placeholder={p.defaults.description} value={form.description} onChange={text("description")} aria-describedby="h-desc" {...err("description")} />
              <Meter len={(form.description || p.defaults.description).length} min={p.thresholds.descriptionMin} max={p.thresholds.descriptionMax} />
              {errorText("description")}
            </div>
          </fieldset>

          <fieldset disabled={!p.canDraft} className="card">
            <legend>Indexing</legend>
            <label className="check">
              <input type="checkbox" checked={form.index} onChange={(e) => set("index", e.target.checked)} />
              <span><b>Show this page in search results</b><span className="hint">Unticked = noindex: removed from Google and from the sitemap.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={form.follow} onChange={(e) => set("follow", e.target.checked)} />
              <span><b>Let search engines follow links on this page</b><span className="hint">Unticked = nofollow.</span></span>
            </label>
            <p className="small">Robots tag: <code className={!form.index || !form.follow ? "code-warn" : ""}>{robotsTag(`${form.index ? "index" : "noindex"}, ${form.follow ? "follow" : "nofollow"}`)}</code></p>
            <div className="field">
              <label htmlFor="f-canonical">Canonical URL</label>
              <span className="hint" id="h-canonical">The preferred address of this page. Default: {p.defaults.canonical ?? "none"}</span>
              <input id="f-canonical" className="input" inputMode="url" placeholder={p.defaults.canonical ?? ""} value={form.canonical} onChange={text("canonical")} aria-describedby="h-canonical" {...err("canonical")} />
              {errorText("canonical")}
              {valid?.canonical && new URL(valid.canonical).pathname !== p.page.path ? <span className="field-warn">Points to {new URL(valid.canonical).pathname}, not this page.</span> : null}
            </div>
          </fieldset>

          <fieldset disabled={!p.canDraft} className="card">
            <legend>Social sharing</legend>
            <div className="field">
              <label htmlFor="f-ogtitle">Share title</label>
              <input id="f-ogtitle" className="input" maxLength={120} placeholder={p.defaults.ogTitle} value={form.ogTitle} onChange={text("ogTitle")} {...err("ogTitle")} />
              {errorText("ogTitle")}
            </div>
            <div className="field">
              <label htmlFor="f-ogdesc">Share description</label>
              <textarea id="f-ogdesc" className="input" rows={2} maxLength={320} placeholder={p.defaults.ogDescription} value={form.ogDescription} onChange={text("ogDescription")} {...err("ogDescription")} />
              {errorText("ogDescription")}
            </div>
            <div className="field">
              <label htmlFor="f-ogimage">Share image</label>
              <span className="hint" id="h-ogimage">Shown on WhatsApp, Facebook and X. Best around 1200 × 630. A path like /assets/… or a full {site.host} URL.</span>
              <input id="f-ogimage" className="input" list="og-image-list" placeholder={p.defaults.ogImage ?? ""} value={form.ogImage} onChange={text("ogImage")} aria-describedby="h-ogimage" {...err("ogImage")} />
              <datalist id="og-image-list">{p.imageSuggestions.map((s) => <option key={s.url} value={s.url}>{s.label}</option>)}</datalist>
              {errorText("ogImage")}
              {imgError ? <span className="field-error" role="alert">That image could not be loaded.</span> : null}
            </div>
            <div className="form-row">
              <label className="field"><span>og:type</span>
                <select className="input" value={form.ogType} onChange={(e) => set("ogType", e.target.value)}>
                  <option value="">Default ({p.defaults.ogType})</option>
                  {OG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field"><span>X (Twitter) card</span>
                <select className="input" value={form.twitterCard} onChange={(e) => set("twitterCard", e.target.value)}>
                  <option value="">Default ({p.defaults.twitterCard === "summary_large_image" ? "large image" : "small"})</option>
                  {TWITTER_CARDS.map((t) => <option key={t} value={t}>{t === "summary_large_image" ? "Large image" : "Small (summary)"}</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          <details className="card" open={keywordsOpen} onToggle={(e) => setKeywordsOpen(e.currentTarget.open)}>
            <summary>Meta keywords <span className="faint small">(optional)</span></summary>
            <fieldset disabled={!p.canDraft} style={{ border: 0, padding: 0, margin: 0 }}>
              <p className="small muted">Google Search does not use the keywords tag for ranking. Only enable it if a specific tool or workflow needs it.</p>
              <label className="check">
                <input type="checkbox" checked={form.keywordsEnabled} onChange={(e) => set("keywordsEnabled", e.target.checked)} />
                <span><b>Add the keywords tag to the page</b></span>
              </label>
              <div className="field">
                <label htmlFor="f-keywords">Keywords (comma-separated)</label>
                <input id="f-keywords" className="input" maxLength={300} value={form.keywords} onChange={text("keywords")} {...err("keywords")} />
                {errorText("keywords")}
              </div>
            </fieldset>
          </details>

          <details className="card" open={extraOpen} onToggle={(e) => setExtraOpen(e.currentTarget.open)}>
            <summary>Additional meta tags <span className="faint small">(advanced)</span></summary>
            <fieldset disabled={!p.canDraft} style={{ border: 0, padding: 0, margin: 0 }}>
              <p className="small muted">For specialist-requested tags such as site-verification codes. Each becomes <code>&lt;meta name=&quot;…&quot; content=&quot;…&quot;&gt;</code>. Tags the editor already manages (description, robots, keywords, og:*, twitter:*, viewport…) are blocked to avoid conflicts. No HTML or scripts.</p>
              {form.extraMeta.map((t, i) => (
                <div className="extra-row" key={i}>
                  <input className="input" aria-label={`Tag ${i + 1} name`} placeholder="name (e.g. google-site-verification)" value={t.name} onChange={(e) => set("extraMeta", form.extraMeta.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input className="input" aria-label={`Tag ${i + 1} content`} placeholder="content" value={t.content} onChange={(e) => set("extraMeta", form.extraMeta.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} />
                  <button type="button" className="btn btn-sm" onClick={() => set("extraMeta", form.extraMeta.filter((_, j) => j !== i))} aria-label={`Remove tag ${i + 1}`}>Remove</button>
                </div>
              ))}
              {Object.entries(errors).filter(([k]) => k.startsWith("extraMeta")).map(([k, v]) => <span key={k} className="field-error" role="alert">Tag {Number(k.split(".")[1] ?? 0) + 1}: {v}</span>)}
              {form.extraMeta.length < MAX_EXTRA_META ? <button type="button" className="btn btn-sm" onClick={() => set("extraMeta", [...form.extraMeta, { name: "", content: "" }])}>Add tag</button> : null}
            </fieldset>
          </details>

          {p.canDraft ? (
            <div className="action-bar">
              <button type="submit" className="btn btn-primary" disabled={!canSave}>{busy === "draft" ? "Saving…" : "Save"}</button>
              <button type="button" className="btn" disabled={!dirty && !p.draft} onClick={discard}>{!dirty && p.draft ? "Delete saved changes" : "Discard changes"}</button>
              {warnings.length ? <ul className="warn-list" style={{ flexBasis: "100%" }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
              {hasErrors ? <span className="field-error" role="alert">Fix first: {[...new Set(Object.keys(errors).map((k) => ERROR_LABELS[k.split(".")[0]] ?? k))].join(", ")}.</span> : null}
            </div>
          ) : <p className="hint">Your role can view these tags but not change them.</p>}
        </form>

        <aside className="editor-previews" aria-label="Previews">
          <section className="card">
            <h2 className="section">Google preview</h2>
            <div className="snippet" aria-label="Search result preview">
              <div className="s-site"><span className="s-fav" aria-hidden="true">P</span><span><b>PRESS&apos;D</b><br /><span className="s-url">{p.page.url}</span></span></div>
              <div className="s-title">{snippet.title}</div>
              <div className="s-desc">{snippet.description}</div>
            </div>
            <p className="small faint">Illustrative only: Google may rewrite titles and descriptions, and truncation depends on screen width.</p>
          </section>
          <section className="card">
            <h2 className="section">WhatsApp / Facebook / X preview</h2>
            <div className="social-card">
              {preview.ogImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- previewing an arbitrary site image as-is
                <img src={previewSrc(preview.ogImage)} alt="" onError={() => setImgError(true)} onLoad={() => setImgError(false)} className={preview.twitterCard === "summary" ? "social-thumb" : ""} />
              ) : <div className="social-noimg">No share image</div>}
              <div className="social-text">
                <span className="social-domain">{site.host.toUpperCase()}</span>
                <b>{preview.ogTitle}</b>
                <span>{preview.ogDescription}</span>
              </div>
            </div>
            <p className="small faint">Each app crops and caches previews differently; this is an approximation. The published image URL is on {site.host}.</p>
          </section>
          <section className="card">
            <h2 className="section">Currently live</h2>
            <dl className="kv small">
              {FIELD_LABELS.map(([k, label]) => (
                <Fragment key={k}>
                  <dt>{label}</dt>
                  <dd className="wrap-anywhere">{show(live[k])}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        </aside>
      </div>

    </div>
  );
}
