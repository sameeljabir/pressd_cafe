"use client";

// Menu translations for one language: products, categories, subcategories,
// customisation options and interface text. Values come from the language
// file; edits are stored as an overlay ("@content:translations"). A missing
// translation falls back to English on the website — English is never copied
// into another language.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "../client";
import type { MenuDictionary } from "@/lib/i18n/dictionary";
import type { LocaleOverlay } from "@/lib/content/dictionary";
import type { Translations } from "@/lib/content/translations";
import { localeMeta, LOCALES } from "@/lib/i18n/locales";

export interface MenuRef {
  slug: string;
  category: string;
  tagline: string;
  items: { id: string; name: string; description: string; ingredients: string[] }[];
}
export interface StatusRow {
  locale: string;
  percent: number;
  missing: number;
  outdated: string[];
}

type Section = "products" | "categories" | "options" | "ui";

export default function TranslationsEditor({
  locale,
  base,
  english,
  menu,
  subcategories,
  published,
  draft,
  statuses,
  missingKeys,
  canDraft,
}: {
  locale: string;
  /** The language file (locales/<code>/menu.json). */
  base: MenuDictionary;
  /** Effective English (menu text from the menu being published). */
  english: MenuDictionary;
  menu: MenuRef[];
  subcategories: Record<string, string>;
  published: Translations | null;
  draft: { fields: Translations; savedAt: string; savedBy: string } | null;
  statuses: StatusRow[];
  /** "products:<id>", "category:<slug>", … that are missing in this language. */
  missingKeys: string[];
  canDraft: boolean;
}) {
  const router = useRouter();
  const baseline = useMemo(() => structuredClone(draft?.fields ?? published ?? {}), [draft, published]);
  const [all, setAll] = useState<Translations>(baseline);
  const [section, setSection] = useState<Section>(locale === "en" ? "ui" : "products");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const ov: LocaleOverlay = all[locale] ?? {};
  const dirty = JSON.stringify(all) !== JSON.stringify(baseline);
  const isEn = locale === "en";
  const dir = localeMeta(locale).dir;
  const missing = useMemo(() => new Set(missingKeys), [missingKeys]);
  const outdated = new Set(statuses.find((s) => s.locale === locale)?.outdated ?? []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Sets one overlay value; a value equal to the language file is not stored. */
  function put(path: [keyof LocaleOverlay, ...string[]], value: unknown, fileValue: unknown) {
    setAll((x) => {
      const next = structuredClone(x);
      const o = (next[locale] ??= {}) as Record<string, unknown>;
      let node = o;
      for (const k of path.slice(0, -1)) node = (node[k] ??= {}) as Record<string, unknown>;
      const last = path[path.length - 1];
      const same = JSON.stringify(value) === JSON.stringify(fileValue) || value === "" || (Array.isArray(value) && !value.length);
      if (same) delete node[last];
      else node[last] = value;
      // prune empty objects
      const prune = (n: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(n)) if (v && typeof v === "object" && !Array.isArray(v)) { prune(v as Record<string, unknown>); if (!Object.keys(v).length) delete n[k]; }
      };
      prune(o);
      if (!Object.keys(o).length) delete next[locale];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    // Drop translations of products the menu no longer has (e.g. after the menu was restored to an earlier version).
    const known = new Set(menu.flatMap((c) => c.items.map((i) => i.id)));
    const fields = Object.fromEntries(
      Object.entries(all).map(([code, o]) => [code, o.products ? { ...o, products: Object.fromEntries(Object.entries(o.products).filter(([id]) => known.has(id))) } : o]),
    );
    const r = await api("POST", "/api/admin/seo/drafts", { key: "@content:translations", fields, baseSavedAt: draft?.savedAt ?? null });
    setBusy(false);
    if (r.status === 409) return setMsg({ text: "Someone else saved translations while you were editing. Reload to see their version.", error: true });
    setMsg(r.ok ? { text: "Saved as a draft (all languages). Use Confirm & Publish (top bar) to put it on the website." } : { text: r.error ?? "Could not save", error: true });
    if (r.ok) router.refresh();
  }

  const s = q.trim().toLowerCase();
  const match = (...t: string[]) => !s || t.some((x) => x.toLowerCase().includes(s));
  const input = (id: string, value: string, english: string, onChange: (v: string) => void, opts: { multiline?: boolean; max: number; missing?: boolean }) => (
    <label className="field" htmlFor={id}>
      <span className="ref"><b>English:</b> {english || "—"}</span>
      {opts.multiline ? (
        <textarea id={id} className="input" rows={2} dir={dir} lang={locale} maxLength={opts.max} value={value} disabled={!canDraft} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" dir={dir} lang={locale} maxLength={opts.max} value={value} disabled={!canDraft} onChange={(e) => onChange(e.target.value)} />
      )}
      {!value ? <span className="field-warn">Missing — shows English</span> : null}
    </label>
  );

  const sections: { id: Section; label: string }[] = isEn
    ? [{ id: "ui", label: "Interface text" }, { id: "options", label: "Customisation options" }]
    : [{ id: "products", label: "Products" }, { id: "categories", label: "Categories & subcategories" }, { id: "options", label: "Customisation options" }, { id: "ui", label: "Interface text" }];

  return (
    <div className="editor-form">
      <div className="lang-bar" role="group" aria-label="Language">
        {LOCALES.map((l) => {
          const st = statuses.find((x) => x.locale === l.code);
          return (
            <a key={l.code} href={`/admin/seo/translations?lang=${l.code}`} className="btn btn-sm" aria-current={l.code === locale ? "page" : undefined} style={l.code === locale ? { background: "var(--text)", color: "var(--bg)" } : undefined}>
              {l.nativeName} {l.code === "en" ? "· source" : <span className={st && st.percent < 100 ? "pct low" : "pct"}>· {st?.percent ?? 0}%</span>}
            </a>
          );
        })}
      </div>
      {draft ? <div className="notice"><p>Translations draft saved {fmtDate(draft.savedAt)} by {draft.savedBy} — not on the website until it is published.</p></div> : null}
      {isEn ? <p className="notice">English product names, descriptions, ingredients and categories are edited on <a href="/admin/seo/menu">Menu</a>. Here you can change English interface labels.</p> : null}
      {dir === "rtl" ? <p className="small muted">Arabic text is shown right-to-left in the menu; the rest of the page layout stays left-to-right.</p> : null}
      <nav className="tabs" aria-label="Translation sections">
        {sections.map((x) => (
          <a key={x.id} href={`#${x.id}`} aria-current={section === x.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); setSection(x.id); }}>{x.label}</a>
        ))}
      </nav>
      <div className="toolbar">
        <label className="field" style={{ flex: "1 1 220px" }}><span>Search</span><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="English or translated text" /></label>
        <label className="check" style={{ alignSelf: "center" }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only missing or outdated</label>
      </div>

      {section === "products"
        ? menu.map((c) => {
            const items = c.items.filter((it) => {
              const cur = { ...base.products[it.id], ...ov.products?.[it.id] };
              if (onlyMissing && !missing.has(`product:${it.id}`) && !outdated.has(it.id)) return false;
              return match(it.name, it.description, cur?.name ?? "", cur?.description ?? "");
            });
            if (!items.length) return null;
            return (
              <section className="card" key={c.slug}>
                <h2 className="section">{c.category}</h2>
                {items.map((it) => {
                  const file = base.products[it.id];
                  const cur = { ...(file ?? { name: "", description: "" }), ...ov.products?.[it.id] };
                  const ingredients = cur.ingredients ?? [];
                  const ingrMismatch = it.ingredients.length > 0 && ingredients.length !== it.ingredients.length;
                  return (
                    <div className="tr-row" key={it.id}>
                      <div>
                        <b>{it.name}</b> <span className="small faint">{it.id}</span>
                        {outdated.has(it.id) ? <p className="field-warn" style={{ margin: "4px 0 0" }}>The English name changed — check this translation.</p> : null}
                        {input(`n-${it.id}`, cur.name, it.name, (v) => put(["products", it.id, "name"], v, file?.name ?? ""), { max: 80 })}
                      </div>
                      <div>
                        {input(`d-${it.id}`, cur.description, it.description, (v) => put(["products", it.id, "description"], v, file?.description ?? ""), { max: 240, multiline: true })}
                        {it.ingredients.length ? (
                          <label className="field" style={{ marginTop: 8 }}>
                            <span className="ref"><b>Ingredients ({it.ingredients.length}, one per line):</b> {it.ingredients.join(" · ")}</span>
                            <textarea className="input" rows={3} dir={dir} lang={locale} disabled={!canDraft} value={ingredients.join("\n")} onChange={(e) => put(["products", it.id, "ingredients"], e.target.value.split("\n"), file?.ingredients ?? [])} />
                            {ingrMismatch ? <span className="field-warn">Needs exactly {it.ingredients.length} lines, one per English ingredient (now {ingredients.filter(Boolean).length}).</span> : null}
                          </label>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })
        : null}

      {section === "categories" ? (
        <>
          <section className="card">
            <h2 className="section">Categories</h2>
            {menu.filter((c) => (!onlyMissing || missing.has(`category:${c.slug}`) || missing.has(`tagline:${c.slug}`)) && match(c.category, c.tagline)).map((c) => (
              <div className="tr-row" key={c.slug}>
                {input(`c-${c.slug}`, ov.categories?.[c.slug] ?? base.categories[c.slug] ?? "", c.category, (v) => put(["categories", c.slug], v, base.categories[c.slug] ?? ""), { max: 40 })}
                {c.tagline ? input(`t-${c.slug}`, ov.categoryTaglines?.[c.slug] ?? base.categoryTaglines[c.slug] ?? "", c.tagline, (v) => put(["categoryTaglines", c.slug], v, base.categoryTaglines[c.slug] ?? ""), { max: 80 }) : <span />}
              </div>
            ))}
          </section>
          <section className="card">
            <h2 className="section">Subcategories</h2>
            <div className="form-row">
              {Object.entries(subcategories).filter(([k, en]) => (!onlyMissing || missing.has(`subcategory:${k}`)) && match(en)).map(([k, en]) => (
                <div key={k}>{input(`s-${k}`, ov.subcategories?.[k] ?? base.subcategories[k] ?? "", en, (v) => put(["subcategories", k], v, base.subcategories[k] ?? ""), { max: 30 })}</div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {section === "options" ? (
        <section className="card">
          <h2 className="section">Customisation options</h2>
          {(["beans", "milk", "syrup"] as const).map((g) => (
            <div key={g}>
              <h3 className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>{g}</h3>
              <div className="form-row">
                {Object.entries(english.customization[g]).filter(([k, en]) => (!onlyMissing || missing.has(`customization:${g}.${k}`)) && match(en)).map(([k, en]) => (
                  <div key={k}>{input(`o-${g}-${k}`, ov.customization?.[g]?.[k] ?? base.customization[g][k] ?? "", isEn ? base.customization[g][k] : en, (v) => put(["customization", g, k], v, base.customization[g][k] ?? ""), { max: 40 })}</div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {section === "ui" ? (
        <section className="card">
          <h2 className="section">Interface text</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Keep placeholders such as <code>{"{name}"}</code> or <code>{"{phone}"}</code> exactly as they are.</p>
          {Object.entries(english.ui).filter(([k, en]) => (!onlyMissing || missing.has(`ui:${k}`)) && match(en, k)).map(([k, en]) => (
            <div className="tr-row" key={k}>
              <span className="small faint mono">{k}</span>
              {input(`u-${k}`, ov.ui?.[k] ?? base.ui[k] ?? "", isEn ? base.ui[k] : en, (v) => put(["ui", k], v, base.ui[k] ?? ""), { max: 200 })}
            </div>
          ))}
        </section>
      ) : null}

      {canDraft ? (
        <div className="action-bar sticky-actions">
          <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save draft"}</button>
          <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setAll(structuredClone(baseline))}>Undo changes</button>
          <a className="btn" href="/api/admin/preview?section=menu" target="_blank" rel="noreferrer">Preview saved draft ↗</a>
          {dirty ? <span className="small" style={{ color: "var(--amber)" }}>Unsaved changes</span> : null}
          {msg ? <span className={msg.error ? "field-error" : "small"} role={msg.error ? "alert" : "status"} style={msg.error ? undefined : { color: "var(--good)" }}>{msg.text}</span> : null}
        </div>
      ) : (
        <p className="hint">Your role can view translations but not change them.</p>
      )}
    </div>
  );
}
