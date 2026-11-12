"use client";

// Editor for one page section (lib/content/pages.ts): text in 12 languages,
// on/off switches, list items and photos from the image library. Saves a
// draft; nothing reaches the website until Confirm & Publish.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "../client";
import ImagePicker from "./ImagePicker";
import LangBar from "./LangBar";
import { PAGE_BY_KEY } from "@/lib/content/pages";
import { effectiveShared, missingTranslations, textPaths, validateContent, type ContentDoc, type ListItem, type ListSpec, type TextSpec } from "@/lib/content/schema";
import { LIBRARY_SRCS } from "@/lib/content/library";
import { MetadataValidationError } from "@/lib/seo/core/metadata";
import { DEFAULT_LOCALE, localeMeta } from "@/lib/i18n/locales";

interface DraftInfo {
  fields: ContentDoc;
  savedAt: string;
  savedBy: string;
}

type State = { shared: Record<string, unknown>; text: Record<string, Record<string, string>> };

const fromDoc = (key: string, doc: ContentDoc | null): State => ({
  shared: structuredClone(effectiveShared(PAGE_BY_KEY.get(key)!, doc)),
  text: structuredClone(doc?.text ?? {}),
});

function check(key: string, s: State): { field: string; message: string } | null {
  try {
    validateContent(PAGE_BY_KEY.get(key)!, s, { images: LIBRARY_SRCS });
    return null;
  } catch (e) {
    return e instanceof MetadataValidationError ? { field: e.field, message: e.message } : { field: "_", message: "Invalid" };
  }
}

const newItemId = () => `i${Math.random().toString(36).slice(2, 8)}`;

export default function ContentEditor({
  schemaKey,
  published,
  draft,
  canDraft,
  tab,
  alts,
}: {
  schemaKey: string;
  published: ContentDoc | null;
  draft: DraftInfo | null;
  canDraft: boolean;
  tab: "content" | "images";
  /** Current alt text per image key (edited on Images & alt text). */
  alts: Record<string, string>;
}) {
  const schema = PAGE_BY_KEY.get(schemaKey)!;
  const router = useRouter();
  const baseline = useMemo(() => fromDoc(schemaKey, draft?.fields ?? published), [schemaKey, draft, published]);
  const [s, setS] = useState<State>(baseline);
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(baseline);
  const err = check(schemaKey, s);
  const isEn = locale === DEFAULT_LOCALE;
  const dir = localeMeta(locale).dir;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const missing = useMemo(() => missingTranslations(schema, s), [schema, s]);
  const total = textPaths(schema, s).length;
  const completeness = Object.fromEntries(Object.entries(missing).map(([code, paths]) => [code, total ? Math.round(((total - paths.length) / total) * 100) : 100]));

  const english = (path: string) => s.text[DEFAULT_LOCALE]?.[path] ?? schema.defaults.text[path] ?? "";
  const valueOf = (path: string) => (isEn ? english(path) : s.text[locale]?.[path] ?? "");
  const setText = (path: string, v: string) =>
    setS((x) => ({ ...x, text: { ...x.text, [locale]: { ...(x.text[locale] ?? {}), [path]: v } } }));
  const setShared = (field: string, v: unknown) => setS((x) => ({ ...x, shared: { ...x.shared, [field]: v } }));

  async function save() {
    setBusy(true);
    const r = await api("POST", "/api/admin/seo/drafts", { key: schemaKey, fields: s, baseSavedAt: draft?.savedAt ?? null });
    setBusy(false);
    if (r.status === 409) return setMsg({ text: "Someone else saved this page while you were editing. Copy your changes, then reload to see their version.", error: true });
    setMsg(r.ok ? { text: "Saved as a draft. Preview it, then use Confirm & Publish (top bar) to put it on the website." } : { text: r.error ?? "Could not save", error: true });
    if (r.ok) router.refresh();
  }

  async function discardDraft() {
    if (!confirm("Discard the saved draft of this page? The website is not affected.")) return;
    setBusy(true);
    const r = await api("DELETE", `/api/admin/seo/drafts?key=${encodeURIComponent(schemaKey)}`);
    setBusy(false);
    setMsg(r.ok ? { text: "Draft discarded." } : { text: r.error ?? "Could not discard", error: true });
    if (r.ok) router.refresh();
  }

  const errorFor = (path: string) => (err && (err.field === path || err.field === `${locale}.${path}` || err.field === `en.${path}`) ? err.message : null);

  const textField = (path: string, spec: TextSpec, label: string) => {
    const v = valueOf(path);
    const e = errorFor(path);
    const id = `c-${path}`;
    const common = {
      id,
      className: "input",
      value: v,
      dir,
      lang: locale,
      disabled: !canDraft,
      placeholder: isEn ? "" : `Not translated — shows English: ${english(path)}`,
      onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(path, ev.target.value),
      "aria-invalid": e ? true : undefined,
    };
    return (
      <div className="field" key={path}>
        <label htmlFor={id}>{label}</label>
        {spec.multiline ? <textarea {...common} rows={3} /> : <input {...common} />}
        <span className="hint">
          {v.length}/{spec.max}
          {spec.help ? ` · ${spec.help}` : ""}
        </span>
        {!isEn ? <span className="ref"><b>English:</b> {english(path)}</span> : null}
        {!isEn && !v ? <span className="field-warn">Missing translation — visitors in {localeMeta(locale).englishName} see the English text.</span> : null}
        {isEn && s.text.en?.[path] !== undefined && s.text.en[path] !== schema.defaults.text[path] ? (
          <span className="ref">
            <b>Original:</b> {schema.defaults.text[path]}{" "}
            <button type="button" className="link-btn" disabled={!canDraft} onClick={() => setText(path, schema.defaults.text[path] ?? "")}>Restore original</button>
          </span>
        ) : null}
        {e ? <span className="field-error" role="alert">{e}</span> : null}
      </div>
    );
  };

  const listField = (field: string, spec: ListSpec) => {
    const items = (s.shared[field] as ListItem[]) ?? [];
    const move = (i: number, d: -1 | 1) => {
      const next = [...items];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      setShared(field, next);
    };
    return (
      <div className="field" key={field}>
        <span>{spec.label}</span>
        {spec.help ? <span className="hint">{spec.help}</span> : null}
        {items.map((item, i) => (
          <div className="list-item" key={item.id}>
            <div className="list-item-head">
              <b>{spec.itemLabel} {i + 1}</b>
              <button type="button" className="btn btn-sm" disabled={!canDraft || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${spec.itemLabel} ${i + 1} up`}>↑</button>
              <button type="button" className="btn btn-sm" disabled={!canDraft || i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${spec.itemLabel} ${i + 1} down`}>↓</button>
              <button type="button" className="btn btn-sm" disabled={!canDraft || items.length <= spec.min} onClick={() => setShared(field, items.filter((x) => x.id !== item.id))}>Remove</button>
            </div>
            <div className="form-row">
              {Object.entries(spec.text).map(([prop, ps]) => textField(`${field}.${item.id}.${prop}`, ps, ps.label))}
              {Object.entries(spec.shared).map(([prop, ps]) => (
                <label className="field" key={prop}>
                  <span>{ps.label}</span>
                  <select className="input" value={item[prop]} disabled={!canDraft} onChange={(e) => setShared(field, items.map((x) => (x.id === item.id ? { ...x, [prop]: e.target.value } : x)))}>
                    {ps.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ))}
        {items.length < spec.max ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={!canDraft}
            onClick={() => {
              const id = newItemId();
              setShared(field, [...items, { id, ...Object.fromEntries(Object.entries(spec.shared).map(([p, ps]) => [p, ps.options[0].value])) }]);
              setLocale(DEFAULT_LOCALE);
            }}
          >
            Add {spec.itemLabel.toLowerCase()}
          </button>
        ) : null}
        {err && err.field.startsWith(field) && !err.field.includes(".") ? <span className="field-error" role="alert">{err.message}</span> : null}
      </div>
    );
  };

  const groups = schema.groups
    .map((g) => ({ ...g, fields: g.fields.filter((f) => (tab === "images") === (schema.fields[f].kind === "image")) }))
    .filter((g) => g.fields.length);

  return (
    <div className="editor-form">
      {draft ? (
        <div className="notice">
          <p>
            Draft saved {fmtDate(draft.savedAt)} by {draft.savedBy} — not on the website until it is published.{" "}
            {canDraft ? <button type="button" className="link-btn" onClick={discardDraft} disabled={busy}>Discard draft</button> : null}
          </p>
        </div>
      ) : null}
      {tab === "content" ? <LangBar value={locale} onChange={setLocale} completeness={completeness} /> : null}
      {!groups.length ? <p className="muted">This section has no photos to change.</p> : null}
      {groups.map((g) => (
        <fieldset className="card" key={g.title} disabled={!canDraft}>
          <legend>{g.title}</legend>
          {g.help ? <p className="small muted" style={{ margin: 0 }}>{g.help}</p> : null}
          {g.fields.map((f) => {
            const spec = schema.fields[f];
            if (spec.kind === "text") return textField(f, spec, spec.label);
            if (spec.kind === "list") return listField(f, spec);
            if (spec.kind === "toggle")
              return (
                <label className="check" key={f}>
                  <input type="checkbox" checked={s.shared[f] !== false} onChange={(e) => setShared(f, e.target.checked)} />
                  <span>{spec.label} <span className="hint">All languages</span></span>
                </label>
              );
            if (spec.kind === "choice")
              return (
                <label className="field" key={f}>
                  <span>{spec.label}</span>
                  <select className="input" value={String(s.shared[f])} onChange={(e) => setShared(f, e.target.value)}>
                    {spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              );
            return (
              <div key={f}>
                <ImagePicker label={spec.label} value={String(s.shared[f])} onChange={(src) => setShared(f, src)} disabled={!canDraft} />
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  Alt text: “{alts[spec.altKey] ?? ""}” — <a href="/admin/seo/images">edit on Images &amp; alt text</a>
                </p>
                {errorFor(f) ? <span className="field-error" role="alert">{errorFor(f)}</span> : null}
              </div>
            );
          })}
        </fieldset>
      ))}
      {canDraft ? (
        <div className="action-bar sticky-actions">
          <button type="button" className="btn btn-primary" disabled={!dirty || !!err || busy} onClick={save}>{busy ? "Saving…" : "Save draft"}</button>
          <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setS(baseline)}>Undo changes</button>
          <a className="btn" href={`/api/admin/preview?section=${schema.anchor.slice(1)}`} target="_blank" rel="noreferrer" title="Opens the website with saved drafts (only you see them)">
            Preview saved draft ↗
          </a>
          {dirty ? <span className="small" style={{ color: "var(--amber)" }}>Unsaved changes</span> : null}
          {err && dirty ? <span className="field-error" role="alert">{err.message}</span> : null}
          {msg ? <span className={msg.error ? "field-error" : "small"} role={msg.error ? "alert" : "status"} style={msg.error ? undefined : { color: "var(--good)" }}>{msg.text}</span> : null}
        </div>
      ) : (
        <p className="hint">Your role can view this page but not change it.</p>
      )}
    </div>
  );
}
