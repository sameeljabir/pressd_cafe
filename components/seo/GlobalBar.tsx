"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "./client";
import { checkLive, type ExpectedLive } from "./liveCheck";

interface PendingRow {
  key: string;
  label: string;
  savedBy: string;
  savedAt: string;
  rows: { label: string; before: string; after: string }[];
  warnings: string[];
}

type Notice = { text: string; kind: "good" | "error" | "info" } | null;

/** Top bar on every SEO Studio screen: publish status, Refresh, Confirm & Publish. */
export default function GlobalBar({ pendingCount, lastPublished, canPublish }: { pendingCount: number; lastPublished: { at: string; by: string } | null; canPublish: boolean }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<PendingRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function openConfirm() {
    setNotice(null);
    const r = await api<{ pending: PendingRow[] }>("GET", "/api/admin/seo/publish");
    if (!r.ok || !r.data) return setNotice({ text: r.error ?? "Could not load the changes", kind: "error" });
    setPending(r.data.pending);
    dlg.current?.showModal();
  }

  async function publish() {
    dlg.current?.close();
    setBusy(true);
    const r = await api<{ changes: { key: string; id: number; version: number }[]; expected: ExpectedLive }>("POST", "/api/admin/seo/publish");
    if (!r.ok || !r.data) {
      setBusy(false);
      return setNotice({ text: `Not published — the website is unchanged. ${r.error ?? ""}`, kind: "error" });
    }
    setNotice({ text: `Published ${r.data.changes.length} change set(s). Checking the live page…`, kind: "info" });
    router.refresh();
    const { ok, problems } = await checkLive(r.data.expected);
    const note = ok ? `Rendered page confirmed at ${new Date().toISOString()}` : `After 30 s the page still shows: ${problems.slice(0, 4).join("; ")}`;
    await api("POST", "/api/admin/seo/verification", { changeIds: r.data.changes.map((c) => c.id), verified: ok, note });
    setBusy(false);
    setNotice(ok ? { text: "Published — live check passed: the website now shows these changes.", kind: "good" } : { text: `Published, but the live check failed. ${note}`, kind: "error" });
    router.refresh();
  }

  return (
    <div className="global-bar-wrap">
      <div className="global-bar" role="status" aria-live="polite">
        <span className={`dot ${pendingCount ? "dot-amber" : "dot-good"}`} aria-hidden="true" />
        <span className="global-text">
          {pendingCount ? <b>{pendingCount} saved change set{pendingCount > 1 ? "s" : ""} not published yet</b> : <b>The website is up to date</b>}
          <span className="muted"> · {lastPublished ? `last published ${fmtDate(lastPublished.at)} by ${lastPublished.by}` : "nothing published from SEO Studio yet"}</span>
        </span>
        <span className="global-actions">
          <button className="btn btn-sm" onClick={() => router.refresh()}>↻ Refresh</button>
          {canPublish ? (
            <button className="btn btn-sm btn-primary" disabled={!pendingCount || busy} onClick={openConfirm}>
              {busy ? "Publishing…" : "Confirm & Publish"}
            </button>
          ) : null}
        </span>
      </div>
      {notice ? <div className={`notice ${notice.kind === "error" ? "notice-error" : notice.kind === "good" ? "notice-good" : ""}`} role={notice.kind === "error" ? "alert" : "status"}><p>{notice.text}</p></div> : null}

      <dialog ref={dlg} className="confirm" aria-labelledby="confirm-h">
        <h2 id="confirm-h" className="section">Publish these changes to the website?</h2>
        {pending?.length ? pending.map((p) => (
          <section key={p.key} style={{ marginBottom: 16 }}>
            <h3 className="small" style={{ margin: "0 0 6px" }}><b>{p.label}</b> <span className="faint">· saved {fmtDate(p.savedAt)} by {p.savedBy}</span></h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th scope="col">What</th><th scope="col">Live now</th><th scope="col">After publishing</th></tr></thead>
                <tbody>{p.rows.map((r, i) => <tr key={i}><td className="small">{r.label}</td><td className="small faint wrap-anywhere">{r.before}</td><td className="small wrap-anywhere">{r.after}</td></tr>)}</tbody>
              </table>
            </div>
            {p.warnings.length ? <ul className="warn-list">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
          </section>
        )) : <p className="muted">Nothing to publish.</p>}
        <div className="action-bar">
          <button className="btn btn-primary" onClick={publish} disabled={!pending?.length}>Publish now</button>
          <button className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
        </div>
      </dialog>
    </div>
  );
}
