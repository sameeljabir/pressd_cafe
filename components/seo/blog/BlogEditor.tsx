"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "../client";
import TagInput from "../TagInput";
import SearchPreview from "../SearchPreview";
import SocialPreview from "../SocialPreview";
import RichEditor from "./RichEditor";
import MediaPicker from "./MediaPicker";
import { lengthStatus, snippetPreview, stableJson, MetadataValidationError, type Thresholds } from "@/lib/seo/core/metadata";
import { LIBRARY_SRCS } from "@/lib/content/library";
import { contentFacts, readingMinutes } from "@/lib/blog/content";
import { analyzePost, slugify, STATUS_LABELS, validatePost, type BlogPost, type PostState, type PostStatus } from "@/lib/blog/post";

interface Props {
  id: string | null;
  initial: BlogPost;
  draft: { savedBy: string; savedAt: string } | null;
  live: { version: number; publishedAt: string; publishedBy: string; slug: string } | null;
  status: PostStatus;
  categories: string[];
  tagSuggestions: string[];
  keywords: { keyword: string; type: string }[];
  thresholds: Thresholds;
  siteOrigin: string;
  canDraft: boolean;
  canPublish: boolean;
}

type Notice = { text: string; kind: "good" | "error" | "info" } | null;
const VISIBILITY: Record<PostState, string> = { live: "Public when published", unpublished: "Hidden (unpublished)", archived: "Archived (hidden)" };

/** Dubai time (UTC+4, no daylight saving) ↔ ISO for the date input. */
const toLocalInput = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 4 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+04:00`).toISOString() : "");

function normalize(p: BlogPost, site: URL): string {
  try {
    return stableJson(validatePost(p as unknown as Record<string, unknown>, { site, library: LIBRARY_SRCS }));
  } catch {
    return stableJson(p);
  }
}

export default function BlogEditor(p: Props) {
  const router = useRouter();
  const site = useMemo(() => new URL(p.siteOrigin), [p.siteOrigin]);
  const [form, setForm] = useState<BlogPost>(p.initial);
  const [baseline, setBaseline] = useState(() => normalize(p.initial, new URL(p.siteOrigin)));
  const [slugTouched, setSlugTouched] = useState(!!p.initial.slug);
  const [busy, setBusy] = useState<string | null>(null);
  // The draft this editor last saw (sent as baseSavedAt so a colleague's newer save is never overwritten).
  const [savedAt, setSavedAt] = useState<string | null>(p.draft?.savedAt ?? null);
  const [notice, setNotice] = useState<Notice>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "cover" | "og">(null);
  const [tab, setTab] = useState<"site" | "google" | "social">("site");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const set = <K extends keyof BlogPost>(k: K, v: BlogPost[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setSeo = <K extends keyof BlogPost["seo"]>(k: K, v: BlogPost["seo"][K]) => setForm((f) => ({ ...f, seo: { ...f.seo, [k]: v } }));

  const dirty = useMemo(() => normalize(form, site) !== baseline, [form, site, baseline]);
  const clientError = useMemo(() => {
    try {
      validatePost(form as unknown as Record<string, unknown>, { site, library: LIBRARY_SRCS });
      return null;
    } catch (e) {
      return e instanceof MetadataValidationError ? { field: e.field, message: e.message } : { field: "_", message: "Invalid article" };
    }
  }, [form, site]);
  const facts = useMemo(() => contentFacts(form.content), [form.content]);
  const analysis = useMemo(() => analyzePost(form, { siteHost: site.host, ...p.thresholds }), [form, site, p.thresholds]);
  const isLiveSlugChange = !!p.live && form.slug !== p.live.slug;
  const pendingPublish = !!p.draft && !dirty;

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---------------------------------------------------------------- live preview frame
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = device === "mobile" ? 390 : 1280;
  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "pressd-blog-preview", post: form, siteHost: site.host }, window.location.origin);
  }, [form, site.host]);
  useEffect(() => {
    const t = setTimeout(send, 120); // debounce while typing
    return () => clearTimeout(t);
  }, [send]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && (e.data as { type?: string })?.type === "pressd-blog-preview-ready") send();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [send]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, tab]);

  // ---------------------------------------------------------------- actions
  async function save() {
    if (clientError) {
      setErrorField(clientError.field);
      return setNotice({ text: `Fix first: ${clientError.message}`, kind: "error" });
    }
    setBusy("save");
    setErrorField(null);
    const r = p.id
      ? await api<{ draft: { savedAt: string; fields: BlogPost } }>("POST", "/api/admin/seo/drafts", { key: `@blog:${p.id}`, fields: form, baseSavedAt: savedAt })
      : await api<{ id: string; savedAt: string }>("POST", "/api/admin/seo/blogs", { fields: form });
    setBusy(null);
    if (!r.ok || !r.data) {
      setErrorField(((r.data as { error?: { field?: string } } | null)?.error?.field) ?? null);
      return setNotice({ text: `Not saved. ${r.error ?? ""}`, kind: "error" });
    }
    setBaseline(normalize(form, site));
    setSavedAt((r.data as { draft?: { savedAt: string }; savedAt?: string }).draft?.savedAt ?? (r.data as { savedAt?: string }).savedAt ?? null);
    setNotice({ text: "Draft saved. It is not on the website until it is published.", kind: "good" });
    if (!p.id) router.replace(`/admin/seo/blogs/${(r.data as { id: string }).id}/edit?saved=1`);
    // Also refreshes the shared top bar (its "not published yet" count lives in the layout).
    router.refresh();
  }

  async function action(name: "publish" | "unpublish" | "archive" | "republish" | "duplicate", confirmText: string) {
    if (!p.id || !window.confirm(confirmText)) return;
    setBusy(name);
    const r = await api<{ result: { id?: string; slug?: string } }>("POST", `/api/admin/seo/blogs/${p.id}`, { action: name });
    setBusy(null);
    if (!r.ok) return setNotice({ text: r.error ?? "Failed — nothing was changed.", kind: "error" });
    if (name === "duplicate") return router.push(`/admin/seo/blogs/${r.data!.result.id}/edit`);
    setNotice({ text: { publish: `Published. Live at /blog/${form.slug}.`, unpublish: "Unpublished — removed from the website.", archive: "Archived — removed from the website.", republish: "Published again." }[name], kind: "good" });
    router.refresh();
  }

  async function discardDraft() {
    if (!p.id || !p.draft) return;
    if (!window.confirm(p.live ? "Delete the saved changes and go back to the published version?" : "This article has never been published. Delete it completely?")) return;
    setBusy("discard");
    const r = p.live ? await api("DELETE", `/api/admin/seo/drafts?key=${encodeURIComponent(`@blog:${p.id}`)}`) : await api("DELETE", `/api/admin/seo/blogs/${p.id}`);
    setBusy(null);
    if (!r.ok) return setNotice({ text: r.error ?? "Could not delete", kind: "error" });
    if (!p.live) return router.push("/admin/seo/blogs");
    window.location.reload();
  }

  const errCls = (f: string) => (errorField === f || clientError?.field === f ? { "aria-invalid": true as const } : {});
  const seoTitle = form.seo.title || form.title;
  const seoDesc = form.seo.description || form.excerpt;
  const shareImg = form.seo.ogImage || form.coverImage || null;
  const back = (e: React.MouseEvent) => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
  };
  const statusText = dirty ? "Unsaved changes" : p.draft ? (p.live ? "Saved draft — the published version is unchanged" : "Saved draft — not published") : p.live ? "Same as the published version" : "New article — not saved";

  return (
    <div className="blog-editor">
      <div className="status-bar" role="status" aria-live="polite">
        <span className={`dot ${dirty || p.draft ? "dot-amber" : "dot-good"}`} aria-hidden="true" />
        <span className="grow">
          <b>{statusText}</b>
          <span className="muted">
            {" · "}<span className={`tag tag-${p.status}`}>{STATUS_LABELS[p.status]}</span>
            {p.live ? ` · live v${p.live.version}, ${fmtDate(p.live.publishedAt)} by ${p.live.publishedBy}` : ""}
            {p.draft && !dirty ? ` · saved ${fmtDate(p.draft.savedAt)} by ${p.draft.savedBy}` : ""}
          </span>
        </span>
        <span className="btn-row">
          <Link className="btn btn-sm" href="/admin/seo/blogs" onClick={back}>← All articles</Link>
          {p.id ? <a className="btn btn-sm" href={`/api/admin/preview?post=${p.id}`} target="_blank" rel="noreferrer" title={dirty ? "Save first — the saved-draft preview shows saved changes only" : "Opens /blog/… with this saved draft (only signed-in users see it)"}>Preview saved draft ↗</a> : null}
          {p.canDraft ? <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || !!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save draft"}</button> : null}
          {p.canPublish && p.id ? (
            <button type="button" className="btn btn-sm btn-publish" disabled={!pendingPublish || !!busy || form.state !== "live"} title={dirty ? "Save first" : !p.draft ? "No saved changes to publish" : form.state !== "live" ? "Visibility is not Public" : "Publish this article's saved draft"}
              onClick={() => action("publish", `Confirm & Publish “${form.title}”?\n\nIt will be ${form.publishDate && new Date(form.publishDate) > new Date() ? `scheduled for ${toLocalInput(form.publishDate).replace("T", " ")} (Dubai)` : "visible immediately"} at /blog/${form.slug}.`)}>
              {busy === "publish" ? "Publishing…" : "Confirm & Publish"}
            </button>
          ) : null}
        </span>
      </div>
      {notice ? <div className={`notice ${notice.kind === "error" ? "notice-error" : notice.kind === "good" ? "notice-good" : ""}`} role={notice.kind === "error" ? "alert" : "status"}><p>{notice.text}</p></div> : null}
      {!p.canDraft ? <p className="hint">Your role can view articles but not change them.</p> : null}

      <div className="blog-editor-grid">
        <div className="blog-editor-main">
          <fieldset disabled={!p.canDraft} className="card">
            <div className="field">
              <label htmlFor="b-title">Title</label>
              <input id="b-title" className="input input-lg" maxLength={140} value={form.title} placeholder="e.g. Five ways to enjoy matcha in Dubai's summer" {...errCls("title")}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((f) => ({ ...f, title, slug: slugTouched || p.live ? f.slug : slugify(title) }));
                }} />
            </div>
            <div className="field">
              <label htmlFor="b-slug">URL</label>
              <div className="slug-row"><span className="muted small">{site.host}/blog/</span>
                <input id="b-slug" className="input" maxLength={80} value={form.slug} {...errCls("slug")} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }} onBlur={() => set("slug", slugify(form.slug))} />
              </div>
              {isLiveSlugChange ? <span className="field-warn">Changing the URL of a published article breaks existing links and shares to /blog/{p.live!.slug}.</span> : null}
            </div>
            <div className="field">
              <label htmlFor="b-excerpt">Excerpt</label>
              <span className="hint">Shown on article cards and used as the meta description when that is empty.</span>
              <textarea id="b-excerpt" className="input" rows={2} maxLength={320} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} {...errCls("excerpt")} />
              <span className="small faint">{form.excerpt.length} / 320</span>
            </div>
          </fieldset>

          <section className="card">
            <div className="card-head"><h2 className="section">Article</h2><span className="small faint">{facts.words} words · {readingMinutes(facts.words)} min read</span></div>
            <RichEditor value={form.content} onChange={(doc) => set("content", doc)} disabled={!p.canDraft} canUpload={p.canDraft} />
            {errorField === "content" || clientError?.field === "content" ? <span className="field-error" role="alert">{clientError?.message}</span> : null}
          </section>

          <fieldset disabled={!p.canDraft} className="card">
            <legend>Details</legend>
            <div className="form-row">
              <label className="field"><span>Category</span>
                <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="">— None —</option>
                  {[...new Set([...p.categories, ...(form.category ? [form.category] : [])])].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="hint">Manage categories on the <Link href="/admin/seo/blogs#categories">articles list</Link>.</span>
              </label>
              <label className="field"><span>Author</span><input className="input" maxLength={80} value={form.author} onChange={(e) => set("author", e.target.value)} /></label>
            </div>
            <TagInput label="Tags" value={form.tags} onChange={(t) => set("tags", t)} max={15} maxLength={40} disabled={!p.canDraft} placeholder={p.tagSuggestions.length ? `e.g. ${p.tagSuggestions.slice(0, 3).join(", ")}` : undefined} />
            <div className="form-row">
              <label className="field"><span>Publication date (Dubai time)</span>
                <input className="input" type="datetime-local" value={toLocalInput(form.publishDate)} onChange={(e) => set("publishDate", fromLocalInput(e.target.value))} {...errCls("publishDate")} />
                <span className="hint">{form.publishDate && new Date(form.publishDate) > new Date() ? "In the future: the article will be scheduled and appears within 5 minutes of this time." : "Empty = the moment it is published."}</span>
              </label>
              <label className="field"><span>Visibility</span>
                <select className="input" value={form.state} onChange={(e) => set("state", e.target.value as PostState)}>
                  {(Object.keys(VISIBILITY) as PostState[]).map((s) => <option key={s} value={s}>{VISIBILITY[s]}</option>)}
                </select>
              </label>
            </div>
            <label className="check"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} /><span><b>Featured article</b><span className="hint">Shown large at the top of /blog.</span></span></label>
          </fieldset>

          <fieldset disabled={!p.canDraft} className="card">
            <legend>Cover image</legend>
            <div className="cover-row">
              {form.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview of a validated site image
                <img className="cover-thumb" src={form.coverImage} alt="" />
              ) : <div className="cover-thumb cover-empty">No cover</div>}
              <div className="field grow">
                <div className="btn-row">
                  <button type="button" className="btn btn-sm" onClick={() => setPicker("cover")}>{form.coverImage ? "Replace image" : "Choose or upload"}</button>
                  {form.coverImage ? <button type="button" className="btn btn-sm" onClick={() => { set("coverImage", ""); set("coverAlt", ""); }}>Remove</button> : null}
                </div>
                <label className="field"><span>Alt text</span>
                  <input className="input" maxLength={250} value={form.coverAlt} placeholder="Describe what the photo shows" onChange={(e) => set("coverAlt", e.target.value)} aria-invalid={form.coverImage && !form.coverAlt ? true : undefined} />
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset disabled={!p.canDraft} className="card">
            <legend>SEO settings</legend>
            <div className="field">
              <label htmlFor="s-title">SEO title</label>
              <span className="hint">Empty = “{form.title || "Title"} | PRESS&apos;D Journal”.</span>
              <input id="s-title" className="input" maxLength={120} value={form.seo.title} onChange={(e) => setSeo("title", e.target.value)} {...errCls("seo.title")} />
              <Meter len={seoTitle.length} min={p.thresholds.titleMin} max={p.thresholds.titleMax} />
            </div>
            <div className="field">
              <label htmlFor="s-desc">Meta description</label>
              <span className="hint">Empty = the excerpt.</span>
              <textarea id="s-desc" className="input" rows={3} maxLength={320} value={form.seo.description} onChange={(e) => setSeo("description", e.target.value)} {...errCls("seo.description")} />
              <Meter len={seoDesc.length} min={p.thresholds.descriptionMin} max={p.thresholds.descriptionMax} />
            </div>
            <div className="form-row">
              <label className="field"><span>Focus keyword</span>
                <input className="input" list="kw-list" maxLength={80} value={form.seo.focusKeyword} onChange={(e) => setSeo("focusKeyword", e.target.value)} placeholder="Pick from Keywords or type" />
                <datalist id="kw-list">{p.keywords.map((k) => <option key={k.keyword} value={k.keyword}>{k.type}</option>)}</datalist>
              </label>
              <label className="field"><span>Add a saved keyword as secondary</span>
                <select className="input" value="" onChange={(e) => e.target.value && setSeo("secondaryKeywords", [...new Set([...form.seo.secondaryKeywords, e.target.value])].slice(0, 15))}>
                  <option value="">{p.keywords.length ? "Choose from Keywords…" : "No saved keywords yet"}</option>
                  {p.keywords.map((k) => <option key={k.keyword} value={k.keyword}>{k.keyword}</option>)}
                </select>
              </label>
            </div>
            <TagInput label="Secondary keywords" value={form.seo.secondaryKeywords} onChange={(v) => setSeo("secondaryKeywords", v)} max={15} maxLength={80} disabled={!p.canDraft} />
            <p className="small faint">Keywords are reused from the <Link href="/admin/seo/keywords">Keywords</Link> list — nothing new is added there.</p>
            <div className="field">
              <label htmlFor="s-canonical">Canonical URL</label>
              <span className="hint">Empty = {site.origin}/blog/{form.slug || "…"}</span>
              <input id="s-canonical" className="input" inputMode="url" value={form.seo.canonical} onChange={(e) => setSeo("canonical", e.target.value)} {...errCls("seo.canonical")} />
            </div>
            <label className="check"><input type="checkbox" checked={form.seo.index} onChange={(e) => setSeo("index", e.target.checked)} /><span><b>Show in search results</b><span className="hint">Unticked = noindex (also left out of the sitemap).</span></span></label>
            <label className="check"><input type="checkbox" checked={form.seo.follow} onChange={(e) => setSeo("follow", e.target.checked)} /><span><b>Let search engines follow links</b><span className="hint">Unticked = nofollow.</span></span></label>
            <h3 className="sub">Social sharing</h3>
            <label className="field"><span>Share title</span><input className="input" maxLength={120} value={form.seo.ogTitle} placeholder={form.seo.title || form.title} onChange={(e) => setSeo("ogTitle", e.target.value)} /></label>
            <label className="field"><span>Share description</span><textarea className="input" rows={2} maxLength={320} value={form.seo.ogDescription} placeholder={seoDesc} onChange={(e) => setSeo("ogDescription", e.target.value)} /></label>
            <div className="cover-row">
              {shareImg ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview of a validated site image
                <img className="cover-thumb" src={shareImg} alt="" />
              ) : <div className="cover-thumb cover-empty">No image</div>}
              <div className="field grow">
                <span>Share image {form.seo.ogImage ? "" : <span className="faint">(using the cover)</span>}</span>
                <div className="btn-row">
                  <button type="button" className="btn btn-sm" onClick={() => setPicker("og")}>Choose a different image</button>
                  {form.seo.ogImage ? <button type="button" className="btn btn-sm" onClick={() => setSeo("ogImage", "")}>Use the cover</button> : null}
                </div>
              </div>
            </div>
            <label className="field"><span>X (Twitter) card</span>
              <select className="input" value={form.seo.twitterCard} onChange={(e) => setSeo("twitterCard", e.target.value as "summary" | "summary_large_image")}>
                <option value="summary_large_image">Large image</option>
                <option value="summary">Small (summary)</option>
              </select>
            </label>
          </fieldset>

          <section className="card">
            <h2 className="section">SEO analysis</h2>
            <ul className="analysis">
              {analysis.map((a) => <li key={a.id} className={`an-${a.level}`}><span className={`an-dot an-dot-${a.level}`} aria-hidden="true" /><span className="sr-only">{a.level === "good" ? "Good: " : a.level === "improve" ? "Improve: " : "Problem: "}</span>{a.text}</li>)}
            </ul>
            <p className="small faint">On-page checks only. They help readers and search engines understand the article; they do not guarantee rankings.</p>
          </section>

          {p.id && (p.canDraft || p.canPublish) ? (
            <section className="card">
              <h2 className="section">Article actions</h2>
              <div className="btn-row">
                {p.canDraft ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => action("duplicate", "Create a copy of this article as a new draft?")}>Duplicate</button> : null}
                {p.canPublish && (p.status === "published" || p.status === "scheduled") ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => action("unpublish", "Unpublish this article now? It will be removed from the website (you can publish it again later).")}>Unpublish</button> : null}
                {p.canPublish && p.live && p.status !== "archived" ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => action("archive", "Archive this article now? It will be removed from the website.")}>Archive</button> : null}
                {p.canPublish && p.live && (p.status === "archived" || p.status === "draft") ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => action("republish", "Make the published version public again?")}>Publish again</button> : null}
                {p.draft && p.canDraft ? <button type="button" className="btn btn-sm btn-danger" disabled={!!busy} onClick={discardDraft}>{p.live ? "Discard saved changes" : "Delete draft"}</button> : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="blog-editor-preview" aria-label="Live preview">
          <div className="card">
            <div className="card-head">
              <span className="seg" role="tablist" aria-label="Preview">
                {(["site", "google", "social"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{{ site: "Website", google: "Google", social: "Social" }[t]}</button>)}
              </span>
              {tab === "site" ? (
                <span className="seg" role="group" aria-label="Device">
                  {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} className={device === d ? "on" : ""} onClick={() => setDevice(d)}>{d === "desktop" ? "Desktop" : "Mobile"}</button>)}
                </span>
              ) : null}
            </div>
            <p className="small faint" style={{ margin: 0 }}>{dirty ? "Showing your unsaved changes — " : ""}live preview, not public.</p>
            <div hidden={tab !== "site"} ref={box} className="live-box-wrap">
              <div className="live-box" style={{ width: width * scale, height: 820 * scale }}>
                <iframe ref={frame} title="Article preview" src="/blog-preview" sandbox="allow-scripts allow-same-origin" onLoad={send} style={{ width, height: 820, transform: `scale(${scale})` }} />
              </div>
            </div>
            {tab === "google" ? <SearchPreview url={`${site.origin}/blog/${form.slug}`} siteName="PRESS'D" title={seoTitle} description={seoDesc} snippet={snippetPreview(seoTitle, seoDesc)} /> : null}
            {tab === "social" ? <SocialPreview host={site.host} title={form.seo.ogTitle || form.seo.title || form.title} description={form.seo.ogDescription || seoDesc} image={shareImg} card={form.seo.twitterCard} /> : null}
          </div>
        </aside>
      </div>

      <MediaPicker open={picker !== null} onClose={() => setPicker(null)} canUpload={p.canDraft} title={picker === "og" ? "Share image" : "Cover image"} onPick={(src) => (picker === "og" ? setSeo("ogImage", src) : set("coverImage", src))} />
    </div>
  );
}

function Meter({ len, min, max }: { len: number; min: number; max: number }) {
  const s = lengthStatus(len, min, max);
  return <span className={`meter meter-${s}`}><span>{{ empty: "Empty", short: "A bit short", good: "Good length", long: "Long — may be shortened" }[s]}</span><span className="num">{len} / {max}</span></span>;
}
