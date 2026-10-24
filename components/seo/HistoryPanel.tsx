"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "./client";
import { checkLive, type ExpectedLive } from "./liveCheck";

export interface HistoryRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  version: number;
  changes: { label: string; before: string; after: string }[];
  verified: boolean | null;
}

/** Publish history for one document, with "Restore" (publishes immediately after confirmation). */
export default function HistoryPanel({ rows, canPublish, title = "Publish history" }: { rows: HistoryRow[]; canPublish: boolean; title?: string }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<{ row: HistoryRow; which: "before" | "after" } | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: "good" | "error" | "info" } | null>(null);

  const open = (row: HistoryRow, which: "before" | "after") => {
    setTarget({ row, which });
    requestAnimationFrame(() => dlg.current?.showModal());
  };

  async function restore() {
    if (!target) return;
    dlg.current?.close();
    setNotice({ text: "Restoring…", kind: "info" });
    const r = await api<{ change: { id: number; version: number }; expected: ExpectedLive }>("POST", "/api/admin/seo/restore", { changeId: target.row.id, which: target.which });
    setTarget(null);
    if (!r.ok || !r.data) return setNotice({ text: `Not restored — the website is unchanged. ${r.error ?? ""}`, kind: "error" });
    setNotice({ text: `Restored and published as version ${r.data.change.version}. Checking the live page…`, kind: "info" });
    router.refresh();
    const { ok, problems } = await checkLive(r.data.expected);
    const note = ok ? `Rendered page confirmed at ${new Date().toISOString()}` : `After 30 s the page still shows: ${problems.slice(0, 4).join("; ")}`;
    await api("POST", "/api/admin/seo/verification", { changeIds: [r.data.change.id], verified: ok, note });
    setNotice(ok ? { text: `Restored as version ${r.data.change.version} — live check passed.`, kind: "good" } : { text: `Restored, but the live check failed. ${note}`, kind: "error" });
    router.refresh();
  }

  const shown = target ? (target.which === "before" ? target.row.changes.map((c) => ({ label: c.label, value: c.before, current: c.after })) : target.row.changes.map((c) => ({ label: c.label, value: c.after, current: c.before }))) : [];

  return (
    <section className="card history" aria-labelledby={`h-${title}`}>
      <h2 className="section" id={`h-${title}`}>{title}</h2>
      {notice ? <div className={`notice ${notice.kind === "error" ? "notice-error" : notice.kind === "good" ? "notice-good" : ""}`} role={notice.kind === "error" ? "alert" : "status"}><p>{notice.text}</p></div> : null}
      {!rows.length ? <p className="muted small">Nothing has been published yet — the website uses the defaults from the code.</p> : (
        <div className="table-wrap">
          <table className="data stack">
            <thead><tr><th scope="col">Version</th><th scope="col">When / who</th><th scope="col">What changed</th><th scope="col">Live check</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((h, idx) => (
                <tr key={h.id}>
                  <td data-label="Version" className="num"><span>v{h.version} <span className="tag">{h.action}</span>{idx === 0 ? <span className="tag tag-good" style={{ marginLeft: 6 }}>live</span> : null}</span></td>
                  <td data-label="When" className="small"><span>{fmtDate(h.at)}<br />{h.actor}</span></td>
                  <td data-label="Changed" className="small"><div>{h.changes.length ? h.changes.map((c, i) => <div key={i}><b>{c.label}</b>: <span className="faint">{c.before}</span> → {c.after}</div>) : "no visible change"}</div></td>
                  <td data-label="Live check" className="small">{h.verified === null ? <span className="faint">not checked</span> : <span className={`tag ${h.verified ? "tag-good" : "tag-bad"}`}>{h.verified ? "confirmed" : "not confirmed"}</span>}</td>
                  <td data-label="Actions">
                    {canPublish && idx === 0 ? <button className="btn btn-sm" onClick={() => open(h, "before")}>Restore previous</button> : null}
                    {canPublish && idx > 0 ? <button className="btn btn-sm" onClick={() => open(h, "after")}>Restore v{h.version}</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dialog ref={dlg} className="confirm" aria-labelledby={`r-${title}`} onClose={() => setTarget(null)}>
        <h2 id={`r-${title}`} className="section">Restore these values?</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">What</th><th scope="col">In that version</th><th scope="col">{target?.which === "before" ? "Being undone" : "Changed afterwards from"}</th></tr></thead>
            <tbody>{shown.map((s, i) => <tr key={i}><td className="small">{s.label}</td><td className="small wrap-anywhere">{s.value}</td><td className="small faint wrap-anywhere">{s.current}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small muted">This publishes immediately as a new version. Saved drafts are kept.</p>
        <div className="action-bar">
          <button className="btn btn-primary" onClick={restore}>Restore and publish</button>
          <button className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
        </div>
      </dialog>
    </section>
  );
}
