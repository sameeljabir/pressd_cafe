"use client";

// Menu management: products (search, filters, add, edit, hide, order) and
// categories/subcategories. Everything is layered on the code menu as
// overrides keyed by stable product IDs; saved as one draft ("@content:menu").

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "../client";
import ProductEditor, { formFromItem, patchFromForm, type ProductFormValues } from "./ProductEditor";
import { menu as BASE } from "@/data/menu";
import { buildEffectiveMenu, menuDiff, newProductId, NUTRITION, validateMenu, type MenuOverrides, type NewProduct } from "@/lib/content/menu";
import { MetadataValidationError } from "@/lib/seo/core/metadata";
import { slugify } from "@/lib/slugify";

type Err = { field: string; message: string } | null;

function check(o: MenuOverrides): Err {
  try {
    validateMenu(o, BASE);
    return null;
  } catch (e) {
    return e instanceof MetadataValidationError ? { field: e.field, message: e.message } : { field: "menu", message: "Invalid menu" };
  }
}

const clone = <T,>(v: T): T => structuredClone(v);

export default function MenuManager({
  published,
  draft,
  canDraft,
  view,
}: {
  published: MenuOverrides | null;
  draft: { fields: MenuOverrides; savedAt: string; savedBy: string } | null;
  canDraft: boolean;
  view: "products" | "categories";
}) {
  const router = useRouter();
  const baseline = useMemo(() => clone(draft?.fields ?? published ?? {}), [draft, published]);
  const [o, setO] = useState<MenuOverrides>(baseline);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; isNew: boolean; form: ProductFormValues; error: Err } | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [vis, setVis] = useState<"all" | "shown" | "hidden">("all");
  const [missingNutrition, setMissingNutrition] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", tagline: "" });

  const m = useMemo(() => buildEffectiveMenu(BASE, o), [o]);
  const dirty = JSON.stringify(o) !== JSON.stringify(baseline);
  const err = useMemo(() => check(o), [o]);
  const changes = useMemo(() => menuDiff(BASE, published, o), [published, o]);
  const publishedIds = useMemo(() => new Set((published?.added ?? []).map((p) => p.id)), [published]);
  const filtering = !!(q.trim() || cat || vis !== "all" || missingNutrition);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const isHidden = (id: string) => m.hidden.has(id);
  const isAdded = (id: string) => !!o.added?.some((p) => p.id === id);

  function setPatch(id: string, patch: Record<string, unknown>) {
    setO((x) => {
      const next = clone(x);
      if (isAdded(id)) next.added = next.added!.map((p) => (p.id === id ? ({ ...p, ...patch } as NewProduct) : p));
      else next.products = { ...(next.products ?? {}), [id]: { ...(next.products?.[id] ?? {}), ...patch } };
      return next;
    });
  }

  function applyEdit(f: ProductFormValues) {
    if (!editing) return;
    const patch = patchFromForm(f);
    const next = clone(o);
    if (editing.isNew) next.added = [...(next.added ?? []), { ...patch, id: editing.id } as NewProduct];
    else if (isAdded(editing.id)) next.added = next.added!.map((p) => (p.id === editing.id ? ({ ...patch, id: p.id } as NewProduct) : p));
    else next.products = { ...(next.products ?? {}), [editing.id]: patch };
    const e = check(next);
    // Only errors about this product block Apply; other problems show in the save bar.
    const mine = e && (e.field.includes(editing.id) || e.field.startsWith("added.") || e.field.startsWith("products."));
    if (mine) return setEditing({ ...editing, form: f, error: e });
    setO(next);
    setEditing(null);
  }

  function move(slug: string, id: string, d: -1 | 1) {
    const ids = m.all.find((c) => c.slug === slug)!.items.map((i) => i[7]);
    const i = ids.indexOf(id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setO((x) => ({ ...x, order: { ...(x.order ?? {}), [slug]: ids } }));
  }

  function moveCategory(slug: string, d: -1 | 1) {
    const slugs = m.all.map((c) => c.slug);
    const i = slugs.indexOf(slug);
    if (i + d < 0 || i + d >= slugs.length) return;
    [slugs[i], slugs[i + d]] = [slugs[i + d], slugs[i]];
    setO((x) => ({ ...x, categoryOrder: slugs }));
  }

  const setCategory = (slug: string, patch: { name?: string; tagline?: string; hidden?: boolean }) =>
    setO((x) => {
      if (x.addedCategories?.some((c) => c.slug === slug)) {
        return { ...x, addedCategories: x.addedCategories.map((c) => (c.slug === slug ? { ...c, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}) } : c)), ...(patch.hidden !== undefined ? { categories: { ...(x.categories ?? {}), [slug]: { ...(x.categories?.[slug] ?? {}), hidden: patch.hidden } } } : {}) };
      }
      return { ...x, categories: { ...(x.categories ?? {}), [slug]: { ...(x.categories?.[slug] ?? {}), ...patch } } };
    });

  async function save() {
    setBusy(true);
    const r = await api("POST", "/api/admin/seo/drafts", { key: "@content:menu", fields: o, baseSavedAt: draft?.savedAt ?? null });
    setBusy(false);
    if (r.status === 409) return setMsg({ text: "Someone else saved the menu while you were editing. Reload to see their version, then make your changes again.", error: true });
    setMsg(r.ok ? { text: "Saved as a draft. Preview it, then use Confirm & Publish (top bar)." } : { text: r.error ?? "Could not save", error: true });
    if (r.ok) router.refresh();
  }

  async function discardDraft() {
    if (!confirm("Discard the saved menu draft? The website is not affected.")) return;
    const r = await api("DELETE", "/api/admin/seo/drafts?key=%40content%3Amenu");
    setMsg(r.ok ? { text: "Draft discarded." } : { text: r.error ?? "Could not discard", error: true });
    if (r.ok) router.refresh();
  }

  const rows = m.all
    .filter((c) => !cat || c.slug === cat)
    .map((c) => ({
      c,
      items: c.items.filter((it) => {
        const s = q.trim().toLowerCase();
        if (s && !`${it[0]} ${it[1]} ${it[7]} ${it[6]}`.toLowerCase().includes(s)) return false;
        if (vis === "shown" && (isHidden(it[7]) || m.hiddenCategories.has(c.slug))) return false;
        if (vis === "hidden" && !(isHidden(it[7]) || m.hiddenCategories.has(c.slug))) return false;
        if (missingNutrition && NUTRITION.every((k) => it[5][k])) return false;
        return true;
      }),
    }))
    .filter((r) => r.items.length || !filtering);
  const total = m.byId.size;
  const hiddenCount = [...m.byId.keys()].filter((id) => isHidden(id)).length;

  const saveBar = canDraft ? (
    <div className="action-bar sticky-actions">
      <button type="button" className="btn btn-primary" disabled={!dirty || !!err || busy} onClick={save}>{busy ? "Saving…" : "Save draft"}</button>
      <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setO(clone(baseline))}>Undo changes</button>
      <a className="btn" href="/api/admin/preview?section=menu" target="_blank" rel="noreferrer">Preview saved draft ↗</a>
      {dirty ? <span className="small" style={{ color: "var(--amber)" }}>Unsaved changes</span> : null}
      {err ? <span className="field-error" role="alert">{err.message}</span> : null}
      {msg ? <span className={msg.error ? "field-error" : "small"} role={msg.error ? "alert" : "status"} style={msg.error ? undefined : { color: "var(--good)" }}>{msg.text}</span> : null}
    </div>
  ) : (
    <p className="hint">Your role can view the menu but not change it.</p>
  );

  if (editing) {
    return (
      <ProductEditor
        title={editing.isNew ? "New product" : `Edit · ${m.byId.get(editing.id)?.item[0] ?? editing.id}`}
        initial={editing.form}
        categories={m.all}
        canDraft={canDraft}
        error={editing.error}
        onApply={applyEdit}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="editor-form">
      {draft ? (
        <div className="notice">
          <p>
            Menu draft saved {fmtDate(draft.savedAt)} by {draft.savedBy} — not on the website until it is published.{" "}
            {canDraft ? <button type="button" className="link-btn" onClick={discardDraft}>Discard draft</button> : null}
          </p>
        </div>
      ) : null}

      {view === "products" ? (
        <>
          <div className="toolbar">
            <label className="field" style={{ flex: "2 1 220px" }}><span>Search</span><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, description or ID" /></label>
            <label className="field" style={{ flex: "1 1 160px" }}><span>Category</span><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{m.all.map((c) => <option key={c.slug} value={c.slug}>{c.category}</option>)}</select></label>
            <label className="field" style={{ flex: "1 1 140px" }}><span>Visibility</span><select className="input" value={vis} onChange={(e) => setVis(e.target.value as typeof vis)}><option value="all">All</option><option value="shown">Shown</option><option value="hidden">Hidden</option></select></label>
            <label className="check" style={{ alignSelf: "center" }}><input type="checkbox" checked={missingNutrition} onChange={(e) => setMissingNutrition(e.target.checked)} /> Missing nutrition</label>
            {canDraft ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setEditing({ id: newProductId(), isNew: true, form: formFromItem(null, cat || m.all[0].slug, false), error: null })}
              >
                Add product
              </button>
            ) : null}
          </div>
          <p className="small muted">{total} products · {hiddenCount} hidden{filtering ? " · reordering is available when no filter is active" : ""}</p>
          {rows.map(({ c, items }) => (
            <section className="card" key={c.slug} aria-label={c.category}>
              <h2 className="section">{c.category}{m.hiddenCategories.has(c.slug) ? <span className="tag tag-amber" style={{ marginLeft: 8 }}>category hidden</span> : null}</h2>
              <div className="prod-list">
                {items.map((it, i) => {
                  const id = it[7];
                  const hidden = isHidden(id);
                  const nutr = NUTRITION.filter((k) => it[5][k]).length;
                  return (
                    <div className={`prod-row${hidden ? " hidden-item" : ""}`} key={id}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                      <img src={it[3]} alt="" loading="lazy" />
                      <button type="button" className="prod-open" onClick={() => setEditing({ id, isNew: false, form: formFromItem(it, c.slug, hidden), error: null })}>
                        <span className="prod-main">
                          <b>{it[0]}</b>
                          <span className="small muted">
                            AED {it[2]} · {it[6]}
                            {it[4] ? ` · ${it[4]}` : ""} · nutrition {nutr}/5{hidden ? " · hidden" : ""}{isAdded(id) ? " · new" : ""}
                          </span>
                        </span>
                      </button>
                      <div className="prod-actions">
                        {canDraft ? (
                          <>
                            <button type="button" className="btn btn-sm" onClick={() => setPatch(id, { hidden: !hidden })}>{hidden ? "Show" : "Hide"}</button>
                            {!filtering ? (
                              <>
                                <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => move(c.slug, id, -1)} aria-label={`Move ${it[0]} up`}>↑</button>
                                <button type="button" className="btn btn-sm" disabled={i === items.length - 1} onClick={() => move(c.slug, id, 1)} aria-label={`Move ${it[0]} down`}>↓</button>
                              </>
                            ) : null}
                            {isAdded(id) && !publishedIds.has(id) ? (
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => setO((x) => ({ ...x, added: x.added!.filter((p) => p.id !== id), order: Object.fromEntries(Object.entries(x.order ?? {}).map(([k, v]) => [k, v.filter((y) => y !== id)])) }))}>
                                Remove
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        <button type="button" className="btn btn-sm" onClick={() => setEditing({ id, isNew: false, form: formFromItem(it, c.slug, hidden), error: null })}>{canDraft ? "Edit" : "View"}</button>
                      </div>
                    </div>
                  );
                })}
                {!items.length ? <p className="small muted">No products in this category.</p> : null}
              </div>
            </section>
          ))}
          {!rows.length ? <p className="muted">No products match these filters.</p> : null}
        </>
      ) : (
        <>
          <section className="card" aria-labelledby="cats">
            <h2 className="section" id="cats">Categories</h2>
            <p className="small muted" style={{ marginTop: 0 }}>Order, names and short descriptions of the menu tabs. Hiding a category hides all its products.</p>
            {m.all.map((c, i) => (
              <div className="list-item" key={c.slug} style={{ marginBottom: 10 }}>
                <div className="list-item-head">
                  <b>{c.category} <span className="small faint">({c.items.length} products · {c.slug})</span></b>
                  {canDraft ? (
                    <>
                      <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => moveCategory(c.slug, -1)} aria-label={`Move ${c.category} up`}>↑</button>
                      <button type="button" className="btn btn-sm" disabled={i === m.all.length - 1} onClick={() => moveCategory(c.slug, 1)} aria-label={`Move ${c.category} down`}>↓</button>
                      <button type="button" className="btn btn-sm" onClick={() => setCategory(c.slug, { hidden: !m.hiddenCategories.has(c.slug) })}>{m.hiddenCategories.has(c.slug) ? "Show" : "Hide"}</button>
                    </>
                  ) : null}
                </div>
                <div className="form-row">
                  <label className="field"><span>Name (English)</span><input className="input" value={c.category} maxLength={40} disabled={!canDraft} onChange={(e) => setCategory(c.slug, { name: e.target.value })} /></label>
                  <label className="field"><span>Short description</span><input className="input" value={c.tagline} maxLength={80} disabled={!canDraft} onChange={(e) => setCategory(c.slug, { tagline: e.target.value })} /></label>
                </div>
              </div>
            ))}
            {canDraft ? (
              <div className="form-row" style={{ alignItems: "end" }}>
                <label className="field"><span>New category name</span><input className="input" value={newCat.name} maxLength={40} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} /></label>
                <label className="field"><span>Short description</span><input className="input" value={newCat.tagline} maxLength={80} onChange={(e) => setNewCat({ ...newCat, tagline: e.target.value })} /></label>
                <button
                  type="button"
                  className="btn"
                  disabled={!newCat.name.trim()}
                  onClick={() => {
                    const slug = slugify(newCat.name);
                    setO((x) => ({ ...x, addedCategories: [...(x.addedCategories ?? []), { slug, name: newCat.name.trim(), tagline: newCat.tagline.trim() }] }));
                    setNewCat({ name: "", tagline: "" });
                  }}
                >
                  Add category
                </button>
              </div>
            ) : null}
            <p className="small muted">A new category appears on the menu once it has at least one visible product.</p>
          </section>
          <section className="card" aria-labelledby="subs">
            <h2 className="section" id="subs">Subcategories</h2>
            <p className="small muted" style={{ marginTop: 0 }}>English names of the groups inside each category. Translations are on Menu translations.</p>
            <div className="form-row">
              {Object.entries(m.subcategoryNames).map(([slug, name]) => (
                <label className="field" key={slug}>
                  <span>{slug}</span>
                  <input className="input" value={name} maxLength={30} disabled={!canDraft} onChange={(e) => setO((x) => ({ ...x, subcategories: { ...(x.subcategories ?? {}), [slug]: { name: e.target.value } } }))} />
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      {changes.length ? (
        <details className="card">
          <summary>{changes.length} change{changes.length === 1 ? "" : "s"} compared with the website</summary>
          <div className="table-wrap">
            <table className="data stack">
              <thead><tr><th scope="col">What</th><th scope="col">Website now</th><th scope="col">After publishing</th></tr></thead>
              <tbody>
                {changes.slice(0, 200).map((r, i) => (
                  <tr key={i}><td data-label="What">{r.label}</td><td data-label="Now" className="wrap-anywhere">{r.before}</td><td data-label="After" className="wrap-anywhere">{r.after}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      {saveBar}
    </div>
  );
}
