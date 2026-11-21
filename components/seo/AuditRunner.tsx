"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate } from "./client";
import { AREA_LABEL, STATUS_LABEL, STATUS_ORDER, WEIGHTS, countByStatus, type Area, type CheckStatus } from "@/lib/seo/core/siteAudit";
import type { AuditRun } from "@/lib/seo/services/siteAudit";

interface Props {
  targets: { id: "live" | "app"; label: string; url: string; note: string }[];
  initial: Record<"live" | "app", AuditRun | null>;
  history: Record<"live" | "app", { id: string; ranAt: string; ranBy: string; score: number | null }[]>;
  canRun: boolean;
  initialTarget: "live" | "app";
}

export function ScoreBadge({ score }: { score: number | null }) {
  const tone = score === null ? "" : score >= 90 ? "score-good" : score >= 70 ? "score-ok" : "score-bad";
  return <span className={`score ${tone}`} aria-label={score === null ? "No score" : `Health score ${score} out of 100`}>{score ?? "—"}<small>/100</small></span>;
}

export default function AuditRunner({ targets, initial, history, canRun, initialTarget }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<"live" | "app">(initialTarget);
  const [runs, setRuns] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckStatus | "">("");
  const [area, setArea] = useState<Area | "">("");
  const [scope, setScope] = useState<"" | "page" | "site">("");

  const run = runs[target];
  const t = targets.find((x) => x.id === target)!;
  const counts = run ? countByStatus(run.checks) : null;
  const areas = useMemo(() => [...new Set(run?.checks.map((c) => c.area) ?? [])], [run]);
  const shown = useMemo(() => (run?.checks ?? []).filter((c) => (!status || c.status === status) && (!area || c.area === area) && (!scope || c.scope === scope)), [run, status, area, scope]);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<{ run: AuditRun }>("POST", "/api/admin/seo/audit", { target });
    setBusy(false);
    if (!r.ok || !r.data) return setError(r.error ?? "The audit could not be run.");
    setRuns((x) => ({ ...x, [target]: r.data!.run }));
    router.refresh(); // overview and history pick up the new run
  }

  return (
    <div className="audit">
      <div className="card">
        <div className="toolbar">
          <span className="seg seg-lg" role="group" aria-label="Audit target">
            {targets.map((x) => (
              <button key={x.id} type="button" className={target === x.id ? "on" : ""} aria-pressed={target === x.id} onClick={() => { setTarget(x.id); setError(null); }}>{x.label}</button>
            ))}
          </span>
          {canRun ? <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>{busy ? "Running audit…" : "Run SEO audit"}</button> : <span className="hint">Your role can view audits but not run them.</span>}
        </div>
        <p className="small muted" style={{ margin: 0 }}><span className="mono">{t.url}</span> — {t.note}</p>
        {busy ? <div className="progress-line" role="status" aria-live="polite"><span />Fetching the page, robots.txt, sitemap and internal links… (up to a minute)</div> : null}
        {error ? <div className="notice notice-error" role="alert"><p>{error}</p></div> : null}
      </div>

      {!run ? (
        <div className="empty card">No audit has been run for this target yet.{canRun ? " Use “Run SEO audit”." : ""}</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat"><span className="stat-label">Health score</span><ScoreBadge score={run.score} /><span className="small faint">ran {fmtDate(run.ranAt)} by {run.ranBy} · {Math.round(run.durationMs / 100) / 10} s</span></div>
            {STATUS_ORDER.map((s) => (
              <button key={s} type="button" className={`stat stat-btn stat-${s} ${status === s ? "is-on" : ""}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? "" : s)}>
                <span className="stat-label">{STATUS_LABEL[s]}</span><span className="stat-value">{counts![s]}</span>
              </button>
            ))}
          </div>

          <details className="card">
            <summary>How the score is calculated</summary>
            <p className="small">Each check has a weight by how much it matters: critical {WEIGHTS.critical}, warning {WEIGHTS.warning}, suggestion {WEIGHTS.suggestion}. The score is the share of the total weight that passed: <code>100 × passed weight ÷ total weight</code>. One failed critical check costs as much as ten failed suggestions. Only checks that actually ran count; things this dashboard cannot measure (listed below) are left out rather than guessed.</p>
          </details>

          <section className="card">
            <div className="toolbar">
              <h2 className="section grow">Results</h2>
              <select className="input" aria-label="Filter by area" value={area} onChange={(e) => setArea(e.target.value as Area | "")}>
                <option value="">All areas</option>
                {areas.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
              </select>
              <select className="input" aria-label="Filter by scope" value={scope} onChange={(e) => setScope(e.target.value as "" | "page" | "site")}>
                <option value="">Page & site-wide</option>
                <option value="page">Page checks (home page)</option>
                <option value="site">Site-wide checks</option>
              </select>
              {status || area || scope ? <button type="button" className="btn btn-sm" onClick={() => { setStatus(""); setArea(""); setScope(""); }}>Clear filters</button> : null}
            </div>
            {shown.length ? (
              <ul className="check-list">
                {shown.map((c) => (
                  <li key={c.id} className={`check-item check-${c.status}`}>
                    <span className={`sev sev-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    <div className="check-body">
                      <b>{c.title}</b>
                      <span className="small faint"> · {AREA_LABEL[c.area]} · {c.scope === "page" ? new URL(run.url).pathname : "site-wide"}</span>
                      <p className="small wrap-anywhere">{c.detail}</p>
                      {c.fix ? <p className="small check-fix"><b>Fix:</b> {c.fix}</p> : null}
                    </div>
                    {c.href && c.status !== "passed" ? <Link className="btn btn-sm" href={c.href}>Open editor</Link> : null}
                  </li>
                ))}
              </ul>
            ) : <div className="empty">No checks match these filters.</div>}
          </section>

          <section className="card">
            <h2 className="section">Not checked here</h2>
            <p className="small muted">These need Google&apos;s data or a real browser, so this audit does not report them.</p>
            <ul className="kv-list small">
              {run.notChecked.map((n) => <li key={n.area}><b>{n.area}</b> — {n.reason} <span className="faint">{n.how}</span></li>)}
            </ul>
          </section>
        </>
      )}

      {history[target].length > 1 ? (
        <section className="card">
          <h2 className="section">Previous runs</h2>
          <ul className="history-mini small">
            {history[target].map((h) => <li key={h.id}><ScoreBadge score={h.score} /> <span>{fmtDate(h.ranAt)}</span> <span className="faint">by {h.ranBy}</span></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
