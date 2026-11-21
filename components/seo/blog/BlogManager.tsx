"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "../client";
import { STATUS_LABELS, type PostStatus } from "@/lib/blog/post";

export interface ListRow {
  id: string;
  title: string;
  slug: string;
  category: string;
  cover: string;
  status: PostStatus;
  pending: boolean;
  hasLive: boolean;
  featured: boolean;
  publishDate: string;
  createdAt: string;
  updatedAt: string;
}

type Notice = { text: string; kind: "good" | "error" | "info" } | null;
type Sort = "newest" | "oldest" | "updated";

export default function BlogManager({ rows, categories: initialCats, canDraft, canPublish }: { rows: ListRow[]; categories: string[]; canDraft: boolean; canPublish: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [status, setStatus] = useState<"" | PostStatus | "pending">("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState(initialCats);
  const [newCat, setNewCat] = useState("");

  const dateOf = (r: ListRow) => r.publishDate || r.createdAt;
  const shown = useMemo(() => {
    const n = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!n || r.title.toLowerCase().includes(n) || r.slug.includes(n)) &&
        (!status || (status === "pending" ? r.pending : r.status === status)) &&
        (!category || r.category === category) &&
        (!from || dateOf(r).slice(0, 10) >= from) &&
        (!to || dateOf(r).slice(0, 10) <= to),
    );
    return list.sort((a, b) => (sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : sort === "newest" ? dateOf(b).localeCompare(dateOf(a)) : dateOf(a).localeCompare(dateOf(b))));
  }, [rows, query, status, category, from, to, sort]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { published: 0, scheduled: 0, draft: 0, archived: 0, pending: 0 };
    for (const r of rows) {
      c[r.status]++;
      if (r.pending) c.pending++;
    }
    return c;
  }, [rows]);

  async function act(id: string, action: string, confirmText: string, done: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(`${id}:${action}`);
    const r = action === "delete" ? await api("DELETE", `/api/admin/seo/blogs/${id}`) : await api<{ result: { id?: string } }>("POST", `/api/admin/seo/blogs/${id}`, { action });
    setBusy(null);
    if (!r.ok) return setNotice({ text: r.error ?? "Failed — nothing was changed.", kind: "error" });
    setNotice({ text: done, kind: "good" });
    router.refresh();
  }

  async function bulk(action: "unpublish" | "archive" | "delete") {
    const ids = [...selected];
    const names = rows.filter((r) => selected.has(r.id)).map((r) => `• ${r.title}`);
    if (!window.confirm(`${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Unpublish"} ${ids.length} article(s)?\n\n${names.slice(0, 10).join("\n")}${names.length > 10 ? "\n…" : ""}${action === "delete" ? "\n\nDeleted articles are removed from the website and the list. Their publish history is kept." : ""}`)) return;
    setBusy("bulk");
    const r = await api<{ done: string[]; failed: { id: string; error: string }[] }>("POST", "/api/admin/seo/blogs/bulk", { ids, action });
    setBusy(null);
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Failed — nothing was changed.", kind: "error" });
    const { done, failed } = r.data;
    setSelected(new Set());
    setNotice({ text: `${done.length} article(s) updated.${failed.length ? ` ${failed.length} not changed: ${failed.map((f) => f.error).slice(0, 2).join(" ")}` : ""}`, kind: failed.length ? "error" : "good" });
    router.refresh();
  }

  async function catAdd(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ categories: string[] }>("POST", "/api/admin/seo/blogs/categories", { name: newCat });
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Could not add the category", kind: "error" });
    setCats(r.data.categories);
    setNewCat("");
    setNotice({ text: "Category added.", kind: "good" });
  }
  async function catRemove(name: string) {
    if (!window.confirm(`Remove the category “${name}”?`)) return;
    const r = await api<{ categories: string[] }>("DELETE", "/api/admin/seo/blogs/categories", { name });
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Could not remove the category", kind: "error" });
    setCats(r.data.categories);
    setNotice({ text: "Category removed.", kind: "info" });
  }

  const allSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));
  return (
    <div className="kw">
      {notice ? <div className={`notice ${notice.kind === "error" ? "notice-error" : notice.kind === "good" ? "notice-good" : ""}`} role={notice.kind === "error" ? "alert" : "status"}><p>{notice.text}</p></div> : null}

      <div className="stat-grid">
        {([["published", "Published"], ["scheduled", "Scheduled"], ["draft", "Drafts"], ["archived", "Archived"], ["pending", "Unpublished changes"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`stat stat-btn ${status === k ? "is-on" : ""}`} aria-pressed={status === k} onClick={() => setStatus(status === k ? "" : k)}>
            <span className="stat-label">{label}</span><span className="stat-value">{counts[k]}</span>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="toolbar">
          <label className="field grow"><span className="sr-only">Search articles</span><input className="input" type="search" placeholder="Search titles or URLs…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as PostStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            <option value="pending">Unpublished changes</option>
          </select>
          <select className="input" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {[...new Set([...cats, ...rows.map((r) => r.category).filter(Boolean)])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="field"><span>From</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>To</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="updated">Last updated</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <div className="btn-row small">
          <span className="muted">{shown.length} of {rows.length} article(s)</span>
          {selected.size ? (
            <>
              <span className="muted">· {selected.size} selected:</span>
              {canPublish ? <button type="button" className="btn btn-sm" disabled={busy === "bulk"} onClick={() => bulk("unpublish")}>Unpublish</button> : null}
              {canPublish ? <button type="button" className="btn btn-sm" disabled={busy === "bulk"} onClick={() => bulk("archive")}>Archive</button> : null}
              {canDraft ? <button type="button" className="btn btn-sm btn-danger" disabled={busy === "bulk"} onClick={() => bulk("delete")}>Delete</button> : null}
            </>
          ) : null}
        </div>

        {!rows.length ? (
          <div className="empty">No articles yet.{canDraft ? <> <Link href="/admin/seo/blogs/new">Write the first one →</Link></> : null}</div>
        ) : !shown.length ? (
          <div className="empty">No articles match these filters. <button type="button" className="link-btn" onClick={() => { setQ(""); setStatus(""); setCategory(""); setFrom(""); setTo(""); }}>Clear filters</button></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table blog-table-admin">
              <thead>
                <tr>
                  {canDraft ? <th scope="col" className="col-check"><input type="checkbox" aria-label="Select all shown" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...shown.map((r) => r.id)]) : new Set([...selected].filter((i) => !shown.some((r) => r.id === i))))} /></th> : null}
                  <th scope="col">Cover</th>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    {canDraft ? <td className="col-check"><input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} /></td> : null}
                    <td>{r.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                      <img className="blog-thumb" src={r.cover} alt="" loading="lazy" />
                    ) : <span className="blog-thumb blog-thumb-empty" aria-hidden="true" />}</td>
                    <td>
                      <Link href={`/admin/seo/blogs/${r.id}/edit`}><b>{r.title || "Untitled"}</b></Link>{r.featured ? <span className="tag tag-amber" style={{ marginLeft: 6 }}>Featured</span> : null}
                      <span className="small faint block">/blog/{r.slug}</span>
                    </td>
                    <td>{r.category || <span className="faint">—</span>}</td>
                    <td>
                      <span className={`tag tag-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                      {r.status === "scheduled" ? <span className="small faint block">{fmtDate(r.publishDate)}</span> : null}
                      {r.pending ? <span className="small block field-warn">Unpublished changes</span> : null}
                    </td>
                    <td className="small faint nowrap">{fmtDate(r.updatedAt)}</td>
                    <td>
                      <div className="btn-row">
                        <Link className="btn btn-sm" href={`/admin/seo/blogs/${r.id}/edit`}>Edit</Link>
                        <a className="btn btn-sm" href={r.status === "published" && !r.pending ? `/blog/${r.slug}` : `/api/admin/preview?post=${r.id}`} target="_blank" rel="noreferrer">{r.status === "published" && !r.pending ? "View" : "Preview"}</a>
                        {canPublish && r.pending ? <button type="button" className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => act(r.id, "publish", `Publish “${r.title}” now?`, `Published “${r.title}”.`)}>Publish</button> : null}
                        <details className="menu">
                          <summary className="btn btn-sm" aria-label={`More actions for ${r.title}`}>⋯</summary>
                          <div className="menu-list">
                            {canDraft ? <button type="button" onClick={() => act(r.id, "duplicate", `Duplicate “${r.title}” as a new draft?`, "Copy created as a draft.")}>Duplicate</button> : null}
                            {canPublish && (r.status === "published" || r.status === "scheduled") ? <button type="button" onClick={() => act(r.id, "unpublish", `Unpublish “${r.title}”? It will be removed from the website.`, "Unpublished.")}>Unpublish</button> : null}
                            {canPublish && r.hasLive && r.status !== "archived" ? <button type="button" onClick={() => act(r.id, "archive", `Archive “${r.title}”? It will be removed from the website.`, "Archived.")}>Archive</button> : null}
                            {canPublish && r.hasLive && (r.status === "archived" || r.status === "draft") ? <button type="button" onClick={() => act(r.id, "republish", `Make “${r.title}” public again?`, "Published again.")}>Publish again</button> : null}
                            {canDraft && (!r.hasLive || canPublish) ? <button type="button" className="danger" onClick={() => act(r.id, "delete", `Delete “${r.title}”?${r.hasLive ? " It will be removed from the website." : ""} This cannot be undone from the list.`, "Deleted.")}>Delete</button> : null}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" id="categories">
        <h2 className="section">Categories</h2>
        {cats.length ? (
          <ul className="chip-row" aria-label="Categories">
            {cats.map((c) => (
              <li key={c} className="tag-chip"><span>{c}</span>{canPublish ? <button type="button" aria-label={`Remove ${c}`} onClick={() => catRemove(c)}>×</button> : null}</li>
            ))}
          </ul>
        ) : <p className="small muted">No categories yet.</p>}
        {canDraft ? (
          <form className="btn-row" onSubmit={catAdd}>
            <input className="input" style={{ maxWidth: 260 }} maxLength={60} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Coffee, Recipes, News" aria-label="New category" />
            <button type="submit" className="btn btn-sm" disabled={!newCat.trim()}>Add category</button>
          </form>
        ) : null}
        <p className="small faint">A category in use by any article can&apos;t be removed.</p>
      </section>
    </div>
  );
}
