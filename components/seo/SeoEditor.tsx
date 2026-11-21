"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "./client";
import TagInput from "./TagInput";
import SearchPreview from "./SearchPreview";
import SocialPreview from "./SocialPreview";
import {
  effectiveMeta,
  MAX_META_KEYWORDS,
  parseMetaSnippet,
  splitKeywordText,
  stableJson,
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
  /** Keywords assigned to this page in Keywords (internal planning data — never rendered). */
  targetKeywords?: { keyword: string; type: "primary" | "secondary" | "label" }[];
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

const keywordList = (s: string) => splitKeywordText(s).map((k) => k.trim()).filter(Boolean);

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
  // Compares the stored documents, so a change that is saved but not rendered (keywords with the tag off) still counts.
  const draftPending = !!p.draft && stableJson(p.draft.fields) !== stableJson(p.published?.fields ?? {});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const kwPrimary = (p.targetKeywords ?? []).filter((k) => k.type === "primary");
  const inText = (k: string, t: string) => t.toLocaleLowerCase("en").includes(k.toLocaleLowerCase("en"));
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
    // baseSavedAt: refuse to overwrite a draft someone else saved after this editor opened.
    const r = await api<{ draft: { savedAt: string } }>("POST", "/api/admin/seo/drafts", { key: "/", fields: toInput(form), baseSavedAt: p.draft?.savedAt ?? null });
    setBusy(null);
    // Only reported as saved once the server confirms the stored draft.
    setMsg(r.ok && r.data?.draft?.savedAt ? { text: "Saved as a draft. The website changes only when you use Confirm & Publish in the top bar.", kind: "good" } : { text: r.error ?? "Could not save the draft", kind: "error" });
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

  function addPasted() {
    const { tags, skipped } = parseMetaSnippet(pasteText);
    if (!tags.length) return setPasteNote("No <meta name=… content=…> tag found in the pasted text.");
    const existing = new Set(form.extraMeta.map((t) => t.name.trim().toLowerCase()));
    const fresh = tags.filter((t) => !existing.has(t.name.toLowerCase()));
    const room = MAX_EXTRA_META - form.extraMeta.length;
    set("extraMeta", [...form.extraMeta.filter((t) => t.name.trim() || t.content.trim()), ...fresh.slice(0, room)]);
    const notes = [`Added ${Math.min(fresh.length, room)} tag(s).`];
    if (tags.length - fresh.length) notes.push(`${tags.length - fresh.length} already in the list.`);
    if (fresh.length > room) notes.push(`${fresh.length - room} over the limit of ${MAX_EXTRA_META}.`);
    if (skipped) notes.push(`${skipped} non-meta or incomplete tag(s) ignored.`);
    setPasteNote(notes.join(" "));
    setPasteText("");
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
              <TagInput
                id="f-keywords"
                label="Keywords"
                hint="Type and press Enter, or paste a comma-separated list. Saved even while the tag is off (shown as “saved, not on the page”)."
                value={keywordList(form.keywords)}
                onChange={(list) => set("keywords", list.join(", "))}
                max={MAX_META_KEYWORDS}
                disabled={!p.canDraft}
                error={errors.keywords ?? null}
              />
              {!form.keywordsEnabled && form.keywords ? <span className="field-warn">The tag is off: these keywords are saved but not added to the page.</span> : null}
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
              <div className="btn-row">
                {form.extraMeta.length < MAX_EXTRA_META ? <button type="button" className="btn btn-sm" onClick={() => set("extraMeta", [...form.extraMeta, { name: "", content: "" }])}>Add tag</button> : null}
                <button type="button" className="btn btn-sm" aria-expanded={pasteOpen} onClick={() => { setPasteOpen((o) => !o); setPasteNote(null); }}>Paste tag HTML</button>
              </div>
              {pasteOpen ? (
                <div className="field">
                  <label htmlFor="f-paste">Paste one or more tags</label>
                  <span className="hint" id="h-paste">e.g. <code>&lt;meta name=&quot;google-site-verification&quot; content=&quot;…&quot; /&gt;</code> — the name and content are read out; the HTML itself is never stored.</span>
                  <textarea id="f-paste" className="input mono" rows={3} value={pasteText} onChange={(e) => setPasteText(e.target.value)} aria-describedby="h-paste" />
                  <div className="btn-row"><button type="button" className="btn btn-sm" disabled={!pasteText.trim()} onClick={addPasted}>Add from HTML</button></div>
                </div>
              ) : null}
              {pasteNote ? <span className="field-warn" role="status">{pasteNote}</span> : null}
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
          <SearchPreview url={p.page.url} siteName="PRESS'D" title={preview.title} description={preview.description} snippet={snippet} />
          <SocialPreview
            host={site.host}
            title={preview.ogTitle}
            description={preview.ogDescription}
            image={preview.ogImage ? previewSrc(preview.ogImage) : null}
            card={preview.twitterCard}
            onImageError={() => setImgError(true)}
            onImageLoad={() => setImgError(false)}
          />
          {p.targetKeywords ? (
            <section className="card">
              <h2 className="section">Target keywords</h2>
              {p.targetKeywords.length ? (
                <>
                  <ul className="kw-check">
                    {kwPrimary.map((k) => (
                      <li key={k.keyword}>
                        <b>{k.keyword}</b> <span className="tag">primary</span>
                        <span className={`tag ${inText(k.keyword, preview.title) ? "tag-good" : "tag-amber"}`}>{inText(k.keyword, preview.title) ? "in title" : "not in title"}</span>
                        <span className={`tag ${inText(k.keyword, preview.description) ? "tag-good" : "tag-amber"}`}>{inText(k.keyword, preview.description) ? "in description" : "not in description"}</span>
                      </li>
                    ))}
                  </ul>
                  {p.targetKeywords.some((k) => k.type !== "primary") ? <p className="small muted">Also targeting: {p.targetKeywords.filter((k) => k.type !== "primary").map((k) => k.keyword).join(", ")}</p> : null}
                </>
              ) : <p className="small muted">No keywords assigned to this page yet.</p>}
              <p className="small faint">Internal planning data from <a href="/admin/seo/keywords">Keywords</a> — never added to the page HTML.</p>
            </section>
          ) : null}
          <section className="card">
            <h2 className="section">Currently live</h2>
            <dl className="kv small">
              {FIELD_LABELS.map(([k, label]) => (
                <Fragment key={k}>
                  <dt>{label}</dt>
                  <dd className="wrap-anywhere">{k === "keywords" && !live.keywords && p.published?.fields.keywords ? <>— <span className="faint">(saved, tag off: {p.published.fields.keywords})</span></> : show(live[k])}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        </aside>
      </div>

    </div>
  );
}
