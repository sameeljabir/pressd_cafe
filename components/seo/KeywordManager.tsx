"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { api, fmtDate } from "./client";
import TagInput from "./TagInput";
import {
  KEYWORD_STATUSES,
  KEYWORD_TARGETS,
  KEYWORD_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
  keywordOverlaps,
  targetLabel,
  type KeywordRow,
  type KeywordStatus,
  type KeywordType,
} from "@/lib/seo/core/keywords";

type Notice = { text: string; kind: "good" | "error" | "info" } | null;
type SortKey = "keyword" | "target" | "type" | "status" | "updatedAt";

interface Props {
  initial: KeywordRow[];
  canEdit: boolean;
}

/** Keyword planning list. Every change is saved straight away and the list shows what the server stored. */
export default function KeywordManager({ initial, canEdit }: Props) {
  const [rows, setRows] = useState<KeywordRow[]>(initial);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // add form
  const [newKw, setNewKw] = useState<string[]>([]);
  const [newType, setNewType] = useState<KeywordType>("secondary");
  const [newTarget, setNewTarget] = useState<string>("/");
  const [newGroup, setNewGroup] = useState("");

  // filters
  const [q, setQ] = useState("");
  const query = useDeferredValue(q); // keeps typing responsive on long lists
  const [fTarget, setFTarget] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "target", dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const groups = useMemo(() => [...new Set(rows.map((r) => r.group).filter(Boolean))].sort(), [rows]);
  const overlaps = useMemo(() => keywordOverlaps(rows), [rows]);
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en");
    const list = rows.filter(
      (r) =>
        (!needle || r.normalized.includes(needle) || r.notes.toLocaleLowerCase("en").includes(needle) || r.group.toLocaleLowerCase("en").includes(needle)) &&
        (!fTarget || r.target === fTarget) &&
        (!fType || r.type === fType) &&
        (!fStatus || r.status === fStatus) &&
        (!fGroup || r.group === fGroup),
    );
    const val = (r: KeywordRow) => (sort.key === "keyword" ? r.normalized : sort.key === "target" ? r.target : sort.key === "updatedAt" ? r.updatedAt : r[sort.key]);
    return list.sort((a, b) => val(a).localeCompare(val(b)) * sort.dir || a.normalized.localeCompare(b.normalized));
  }, [rows, query, fTarget, fType, fStatus, fGroup, sort]);

  async function reload() {
    setBusy("reload");
    const r = await api<{ keywords: KeywordRow[] }>("GET", "/api/admin/seo/keywords");
    setBusy(null);
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Could not load keywords", kind: "error" });
    setRows(r.data.keywords);
    setSelected(new Set());
    setNotice({ text: `Loaded ${r.data.keywords.length} keyword(s).`, kind: "info" });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newKw.length) return;
    setBusy("add");
    const r = await api<{ added: KeywordRow[]; skipped: string[] }>("POST", "/api/admin/seo/keywords", { keywords: newKw, type: newType, target: newTarget, group: newGroup });
    setBusy(null);
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Could not add the keywords — nothing was saved.", kind: "error" });
    const { added, skipped } = r.data;
    setRows((rs) => [...rs, ...added]);
    setNewKw([]);
    setNotice({
      text: [added.length ? `Saved ${added.length} keyword(s) to ${targetLabel(newTarget)}.` : "", skipped.length ? `Already assigned there: ${skipped.join(", ")}.` : ""].filter(Boolean).join(" "),
      kind: added.length ? "good" : "info",
    });
  }

  async function save(row: KeywordRow, fields: Partial<Pick<KeywordRow, "type" | "target" | "status" | "group" | "notes">>) {
    setBusy(row.id);
    const r = await api<{ keyword: KeywordRow }>("PATCH", "/api/admin/seo/keywords", { id: row.id, fields, expectedUpdatedAt: row.updatedAt });
    setBusy(null);
    if (!r.ok || !r.data) {
      setNotice({ text: r.error ?? "Could not save — nothing was changed.", kind: "error" });
      return false;
    }
    const saved = r.data.keyword;
    setRows((rs) => rs.map((x) => (x.id === saved.id ? saved : x)));
    setNotice({ text: `Saved "${saved.keyword}".`, kind: "good" });
    return true;
  }

  async function remove(ids: string[]) {
    const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.keyword);
    if (!names.length) return;
    const msg = names.length === 1 ? `Delete the keyword "${names[0]}"?` : `Delete ${names.length} keywords?\n\n${names.slice(0, 12).join(", ")}${names.length > 12 ? ", …" : ""}`;
    if (!window.confirm(msg)) return;
    setBusy("delete");
    const r = await api<{ deleted: number }>("DELETE", "/api/admin/seo/keywords", { ids });
    setBusy(null);
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Could not delete — nothing was removed.", kind: "error" });
    setRows((rs) => rs.filter((x) => !ids.includes(x.id)));
    setSelected((s) => new Set([...s].filter((i) => !ids.includes(i))));
    setNotice({ text: `Deleted ${r.data.deleted} keyword(s).`, kind: "info" });
  }

  const sortBtn = (key: SortKey, label: string) => (
    <button type="button" className="link-btn" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))} aria-label={`Sort by ${label}`}>
      {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </button>
  );
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));

  return (
    <div className="kw">
      {notice ? <div className={`notice ${notice.kind === "error" ? "notice-error" : notice.kind === "good" ? "notice-good" : ""}`} role={notice.kind === "error" ? "alert" : "status"}><p>{notice.text}</p></div> : null}

      {canEdit ? (
        <form className="card" onSubmit={add} aria-label="Add keywords">
          <h2 className="section">Add keywords</h2>
          <TagInput label="Keywords" hint="Paste a list (commas, semicolons or one per line) or type and press Enter." value={newKw} onChange={setNewKw} max={50} maxLength={80} />
          <div className="form-row form-row-4">
            <label className="field"><span>Type</span>
              <select className="input" value={newType} onChange={(e) => setNewType(e.target.value as KeywordType)}>
                {KEYWORD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="field"><span>Page / section</span>
              <select className="input" value={newTarget} onChange={(e) => setNewTarget(e.target.value)}>
                {KEYWORD_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="field"><span>Group <span className="faint">(optional)</span></span>
              <input className="input" list="kw-groups" maxLength={60} value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Coffee, Brunch, Location" />
              <datalist id="kw-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </label>
            <div className="field field-end">
              <button type="submit" className="btn btn-primary" disabled={!newKw.length || busy === "add"}>{busy === "add" ? "Saving…" : `Save ${newKw.length || ""} keyword${newKw.length === 1 ? "" : "s"}`}</button>
            </div>
          </div>
          <p className="small faint">Primary = the main phrase a page should rank for (ideally one per page). Internal labels are for your own grouping. None of these are added to the website.</p>
        </form>
      ) : <p className="hint">Your role can view keywords but not change them.</p>}

      {overlaps.length ? (
        <section className="card">
          <h2 className="section">Same keyword on several pages or sections</h2>
          <ul className="issue-list">
            {overlaps.map((o) => (
              <li key={o.normalized}>
                <span>
                  <span className={`sev ${o.primaryConflict ? "sev-high" : "sev-low"}`}>{o.primaryConflict ? "Warning" : "Suggestion"}</span>{" "}
                  <b>{o.keyword}</b> — {o.targets.map(targetLabel).join(", ")}
                  {o.primaryConflict ? ". Several targets use it as their primary keyword; pick one so they don't compete." : ". Fine as a secondary theme; make sure one target leads."}
                </span>
                <button type="button" className="btn btn-sm" onClick={() => { setQ(o.keyword); setFTarget(""); }}>Show</button>
              </li>
            ))}
          </ul>
          <p className="small faint">All sections share the one URL (/), so search engines see them as one page; assignments here are for planning which section covers which topic.</p>
        </section>
      ) : null}

      <section className="card">
        <div className="toolbar">
          <label className="field grow"><span className="sr-only">Search keywords</span>
            <input className="input" type="search" placeholder="Search keywords, groups, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input" aria-label="Filter by page or section" value={fTarget} onChange={(e) => setFTarget(e.target.value)}>
            <option value="">All pages</option>
            {KEYWORD_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select className="input" aria-label="Filter by type" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">All types</option>
            {KEYWORD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select className="input" aria-label="Filter by status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All statuses</option>
            {KEYWORD_STATUSES.map((t) => <option key={t} value={t}>{STATUS_LABELS[t]}</option>)}
          </select>
          {groups.length ? (
            <select className="input" aria-label="Filter by group" value={fGroup} onChange={(e) => setFGroup(e.target.value)}>
              <option value="">All groups</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          ) : null}
          <button type="button" className="btn btn-sm" onClick={reload} disabled={busy === "reload"}>{busy === "reload" ? "Loading…" : "Reload"}</button>
        </div>
        <div className="btn-row small">
          <span className="muted">{shown.length} of {rows.length} keyword(s)</span>
          {canEdit && selected.size ? <button type="button" className="btn btn-sm btn-danger" disabled={busy === "delete"} onClick={() => remove([...selected])}>Delete {selected.size} selected</button> : null}
        </div>

        {rows.length === 0 ? (
          <div className="empty">No keywords yet.{canEdit ? " Add the phrases each section should be found for above." : ""}</div>
        ) : shown.length === 0 ? (
          <div className="empty">No keywords match these filters. <button type="button" className="link-btn" onClick={() => { setQ(""); setFTarget(""); setFType(""); setFStatus(""); setFGroup(""); }}>Clear filters</button></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {canEdit ? <th scope="col" className="col-check"><input type="checkbox" aria-label="Select all shown" checked={allShownSelected} onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...shown.map((r) => r.id)]) : new Set([...selected].filter((i) => !shown.some((r) => r.id === i))))} /></th> : null}
                  <th scope="col">{sortBtn("keyword", "Keyword")}</th>
                  <th scope="col">{sortBtn("type", "Type")}</th>
                  <th scope="col">{sortBtn("target", "Page / section")}</th>
                  <th scope="col">Group</th>
                  <th scope="col">{sortBtn("status", "Status")}</th>
                  <th scope="col">{sortBtn("updatedAt", "Updated")}</th>
                  {canEdit ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) =>
                  editing === r.id ? (
                    <EditRow key={r.id} row={r} groups={groups} busy={busy === r.id} onCancel={() => setEditing(null)} onSave={async (f) => { if (await save(r, f)) setEditing(null); }} />
                  ) : (
                    <tr key={r.id}>
                      {canEdit ? <td className="col-check"><input type="checkbox" aria-label={`Select ${r.keyword}`} checked={selected.has(r.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} /></td> : null}
                      <td><b>{r.keyword}</b>{r.notes ? <span className="small faint block">{r.notes}</span> : null}</td>
                      <td><span className={`tag ${r.type === "primary" ? "tag-good" : ""}`}>{TYPE_LABELS[r.type]}</span></td>
                      <td>{targetLabel(r.target)}</td>
                      <td>{r.group || <span className="faint">—</span>}</td>
                      <td>
                        {canEdit ? (
                          <select className="input input-sm" aria-label={`Status of ${r.keyword}`} value={r.status} disabled={busy === r.id} onChange={(e) => void save(r, { status: e.target.value as KeywordStatus })}>
                            {KEYWORD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                          </select>
                        ) : STATUS_LABELS[r.status]}
                      </td>
                      <td className="small faint nowrap" title={`by ${r.updatedBy}`}>{fmtDate(r.updatedAt, false)}</td>
                      {canEdit ? (
                        <td className="nowrap">
                          <button type="button" className="btn btn-sm" onClick={() => setEditing(r.id)}>Edit</button>{" "}
                          <button type="button" className="btn btn-sm" onClick={() => remove([r.id])} aria-label={`Delete ${r.keyword}`}>Delete</button>
                        </td>
                      ) : null}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="small faint">Search volume, difficulty and rankings are not shown: no keyword-data or Search Console integration is connected, and nothing is estimated.</p>
    </div>
  );
}

function EditRow({ row, groups, busy, onCancel, onSave }: { row: KeywordRow; groups: string[]; busy: boolean; onCancel: () => void; onSave: (f: Partial<KeywordRow>) => void }) {
  const [type, setType] = useState(row.type);
  const [target, setTarget] = useState(row.target);
  const [group, setGroup] = useState(row.group);
  const [notes, setNotes] = useState(row.notes);
  const changed: Partial<KeywordRow> = {
    ...(type !== row.type ? { type } : {}),
    ...(target !== row.target ? { target } : {}),
    ...(group.trim() !== row.group ? { group } : {}),
    ...(notes.trim() !== row.notes ? { notes } : {}),
  };
  const dirty = Object.keys(changed).length > 0;
  return (
    <tr className="row-editing">
      <td colSpan={8}>
        <form
          className="kw-edit"
          onSubmit={(e) => { e.preventDefault(); if (dirty) onSave(changed); }}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
          aria-label={`Edit ${row.keyword}`}
        >
          <b className="kw-edit-name">{row.keyword}</b>
          <label className="field"><span>Type</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as KeywordType)}>{KEYWORD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>
          </label>
          <label className="field"><span>Page / section</span>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>{KEYWORD_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          </label>
          <label className="field"><span>Group</span>
            <input className="input" list="kw-groups-edit" maxLength={60} value={group} onChange={(e) => setGroup(e.target.value)} />
            <datalist id="kw-groups-edit">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </label>
          <label className="field kw-edit-notes"><span>Notes</span>
            <textarea className="input" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn btn-sm" onClick={() => { if (!dirty || window.confirm("Discard your changes to this keyword?")) onCancel(); }}>Cancel</button>
          </div>
        </form>
      </td>
    </tr>
  );
}
