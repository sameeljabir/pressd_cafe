import type { Metadata } from "next";
import Link from "next/link";
import DbMissing from "@/components/seo/DbMissing";
import PageHead from "@/components/seo/PageHead";
import { ScoreBadge } from "@/components/seo/AuditRunner";
import { fmtDateServer } from "@/lib/seo/format";
import { requirePage } from "@/lib/seo/auth/guard";
import { businessWarnings, effectiveBusiness, type BusinessInfo } from "@/lib/seo/core/business";
import { altStatus, altSummary, effectiveAlts } from "@/lib/seo/core/images";
import { effectiveMeta, lengthStatus, overrideWarnings, type MetaOverride } from "@/lib/seo/core/metadata";
import { docLabel, isDocKey } from "@/lib/seo/core/docs";
import { AREA_LABEL, STATUS_LABEL, countByStatus, type Area, type Check, type CheckStatus } from "@/lib/seo/core/siteAudit";
import { siteUrl } from "@/lib/seo/env";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { getOverride, PUBLIC_PAGES } from "@/lib/seo/services/metadata";
import { pendingChanges } from "@/lib/seo/services/docs";
import { getSettings } from "@/lib/seo/services/settings";
import { latestAudit } from "@/lib/seo/services/siteAudit";
import { codeDefaults } from "@/lib/seo/services/verify";
import { SITE_IMAGES, SITE_SECTIONS } from "@/lib/siteImages";

export const metadata: Metadata = { title: "Overview" };

interface Issue {
  status: Exclude<CheckStatus, "passed">;
  source: string;
  text: string;
  detail?: string;
  href: string | null;
  fix: string;
}

const EDIT_TAGS = "/admin/seo/pages?path=%2F&tab=seo";

/** Areas summarised as counters (non-passed audit checks per area). */
const AREA_TILES: { area: Area; label: string }[] = [
  { area: "titles", label: "Title issues" },
  { area: "descriptions", label: "Description issues" },
  { area: "images", label: "Images without alt" },
  { area: "links", label: "Broken internal links" },
  { area: "indexability", label: "Indexability" },
  { area: "canonical", label: "Canonical" },
  { area: "structured-data", label: "Structured data" },
  { area: "social", label: "Open Graph" },
];

export default async function Overview() {
  await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="SEO Studio" title="Overview" /><DbMissing /></>);
  const site = siteUrl();
  const defaults = codeDefaults();
  const [meta, images, business, settings, liveAudit, appAudit, recent] = await Promise.all([
    getOverride(db, "/"), getOverride(db, "@images"), getOverride(db, "@business"), getSettings(db),
    latestAudit(db, "live"), latestAudit(db, "app"),
    db.changes.find({ applied: { $ne: false } }, { sort: { at: -1 }, limit: 8, projection: { key: 1, actor: 1, action: 1, at: 1, version: 1, verified: 1, "after.title": 1 } }).toArray(),
  ]);
  const pending = await pendingChanges(db, defaults, settings.thresholds, site);
  const t = settings.thresholds;

  // Published values (what this app serves).
  const live = effectiveMeta(defaults, (meta?.fields as MetaOverride | undefined) ?? null);
  const metaWarnings = overrideWarnings((meta?.fields as MetaOverride | undefined) ?? {}, live, t, site, "/");
  const alts = effectiveAlts((images?.fields as Record<string, string> | undefined) ?? null);
  const alt = altSummary((images?.fields as Record<string, string> | undefined) ?? null);
  const biz = businessWarnings(effectiveBusiness((business?.fields as Partial<BusinessInfo> | undefined) ?? null), `${defaults.title} ${defaults.description}`);
  const tdOk = lengthStatus(live.title.length, t.titleMin, t.titleMax) === "good" && lengthStatus(live.description.length, t.descriptionMin, t.descriptionMax) === "good";

  // The audit of the real domain is the primary signal; this deployment's audit second.
  const primary = liveAudit ?? appAudit;
  const auditChecks: Check[] = primary?.checks ?? [];
  const counts = countByStatus(auditChecks);
  const areaCount = (a: Area) => auditChecks.filter((c) => c.area === a && c.status !== "passed").length;

  const issues: Issue[] = [
    ...auditChecks.filter((c) => c.status !== "passed").map((c) => ({
      status: c.status as Issue["status"],
      source: primary === liveAudit ? `Audit · ${site.host}` : "Audit · this deployment",
      text: c.title,
      detail: c.fix ?? c.detail,
      href: c.href,
      fix: c.href ? "Open editor" : "",
    })),
    ...metaWarnings.map((text) => ({ status: (/noindex/.test(text) ? "critical" : "suggestion") as Issue["status"], source: "Published tags", text, href: EDIT_TAGS, fix: "Edit tags" })),
    ...SITE_SECTIONS.flatMap((s) => {
      const bad = SITE_IMAGES.filter((i) => i.section === s.id && ["missing", "short"].includes(altStatus(alts[i.key], i.alt === "")));
      return bad.length ? [{ status: "warning" as const, source: "Alt text", text: `${s.label}: ${bad.length} image${bad.length > 1 ? "s" : ""} missing good alt text`, detail: bad.map((i) => i.label).join(", "), href: `/admin/seo/pages?path=%2F&tab=${s.id}`, fix: "Fix alt text" }] : [];
    }),
    ...biz.map((text) => ({ status: "warning" as const, source: "Business info", text, href: "/admin/seo/business", fix: "Edit business info" })),
  ];
  const groups = (["critical", "warning", "suggestion"] as const).map((s) => ({ s, list: issues.filter((i) => i.status === s) }));
  const passed = auditChecks.filter((c) => c.status === "passed");

  return (
    <>
      <PageHead eyebrow="SEO Studio" title="Overview" lede="How the PRESS'D website looks to search engines. Edit, Save, then use Confirm & Publish in the top bar." />

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Health score · {site.host}</span>
          {liveAudit ? <ScoreBadge score={liveAudit.score} /> : <span className="stat-value faint">—</span>}
          <span className="small faint">{liveAudit ? `audited ${fmtDateServer(new Date(liveAudit.ranAt))}` : "not audited yet"} · <Link href="/admin/seo/audit?target=live">audit →</Link></span>
        </div>
        <div className="stat">
          <span className="stat-label">Health score · this deployment</span>
          {appAudit ? <ScoreBadge score={appAudit.score} /> : <span className="stat-value faint">—</span>}
          <span className="small faint">{appAudit ? `audited ${fmtDateServer(new Date(appAudit.ranAt))}` : "not audited yet"} · <Link href="/admin/seo/audit?target=app">audit →</Link></span>
        </div>
        <div className={`stat ${counts.critical ? "stat-bad" : issues.length ? "stat-warn" : "stat-good"}`}>
          <span className="stat-label">Critical · Warnings</span>
          <span className="stat-value">{groups[0].list.length}<small> · {groups[1].list.length}</small></span>
          <span className="small faint">{groups[2].list.length} suggestion(s){primary ? ` · ${passed.length} checks passed` : ""}</span>
        </div>
        <div className={`stat ${pending.length ? "stat-warn" : ""}`}>
          <span className="stat-label">Saved, not published</span>
          <span className="stat-value">{pending.length}</span>
          <span className="small faint">{pending.length ? pending.map((p) => p.label).join(", ") : "website is up to date"}</span>
        </div>
      </div>

      {primary ? (
        <section className="card">
          <div className="card-head">
            <h2 className="section">By area <span className="small faint">— latest audit of {primary === liveAudit ? site.host : "this deployment"}</span></h2>
            <Link className="small" href={`/admin/seo/audit?target=${primary.target}`}>All results →</Link>
          </div>
          <div className="area-grid">
            {AREA_TILES.map(({ area, label }) => {
              const n = areaCount(area);
              return <div key={area} className={`area-tile ${n ? "is-bad" : "is-good"}`}><span className="small">{label}</span><b>{n ? n : "✓"}</b></div>;
            })}
            <div className={`area-tile ${alt.needsWork ? "is-bad" : "is-good"}`}><span className="small">Weak alt text (published)</span><b>{alt.needsWork ? `${alt.needsWork}/${alt.total}` : "✓"}</b></div>
          </div>
        </section>
      ) : (
        <div className="notice"><p>No technical audit yet — counts for broken links, canonical, structured data and indexability come from a real audit. <Link href="/admin/seo/audit">Run the first audit →</Link></p></div>
      )}

      <section className="card">
        <h2 className="section">Issues to fix</h2>
        {issues.length ? (
          groups.filter((g) => g.list.length).map((g) => (
            <div key={g.s} className="issue-group">
              <h3 className="issue-group-head"><span className={`sev sev-${g.s}`}>{STATUS_LABEL[g.s]}</span> {g.list.length}</h3>
              <ul className="issue-list">
                {g.list.map((i, k) => (
                  <li key={`${g.s}-${k}`}>
                    <span><b>{i.text}</b> <span className="small faint">· {i.source}</span>{i.detail ? <span className="small muted block">{i.detail}</span> : null}</span>
                    {i.href ? <Link className="btn btn-sm" href={i.href}>{i.fix || "Open"}</Link> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : <div className="empty">{primary ? "No issues found in the latest audit or the published settings." : "No issues in the published settings. Run an audit to check the delivered HTML."}</div>}
        {passed.length ? (
          <details>
            <summary className="small"><span className="sev sev-passed">Passed</span> {passed.length} checks</summary>
            <ul className="passed-list small">{passed.map((c) => <li key={c.id}>✓ {c.title} <span className="faint">· {AREA_LABEL[c.area]}</span></li>)}</ul>
          </details>
        ) : null}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section">Pages</h2>
          <ul className="page-list">
            {PUBLIC_PAGES.map((p) => (
              <li key={p.path}>
                <Link href={EDIT_TAGS} className="page-list-main">
                  <b>{p.label}</b>
                  <span className="small faint wrap-anywhere">{new URL(p.path, site).toString()}</span>
                  <span className="small">{live.title}</span>
                </Link>
                <span className="page-list-tags">
                  <span className={`tag ${tdOk ? "tag-good" : "tag-amber"}`}>{tdOk ? "Title & description OK" : "Check title & description"}</span>
                  <span className={`tag ${live.robots.startsWith("noindex") ? "tag-bad" : "tag-good"}`}>{live.robots.startsWith("noindex") ? "Hidden from Google" : "Shown in Google"}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="small faint">1 URL with {SITE_SECTIONS.length} sections (views of the same page, sharing its tags).</p>
          <div className="chip-row" aria-label="Sections of the home page">
            {SITE_SECTIONS.filter((s) => SITE_IMAGES.some((i) => i.section === s.id)).map((s) => (
              <Link key={s.id} className="chip" href={`/admin/seo/pages?path=%2F&tab=${s.id}`}>{s.label}</Link>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="section">Recently published</h2>
          {recent.length ? (
            <ul className="recent-list small">
              {recent.map((r) => (
                <li key={r._id.toHexString()}>
                  <b>{isDocKey(r.key) ? docLabel(r.key, r.after) : r.key}</b> <span className="faint">v{r.version} · {r.action}</span>
                  <span className="muted block">{fmtDateServer(r.at)} · {r.actor}{r.verified === true ? " · live check passed" : r.verified === false ? " · live check failed" : ""}</span>
                </li>
              ))}
            </ul>
          ) : <div className="empty">Nothing published from SEO Studio yet.</div>}
        </section>
      </div>
      <p className="small faint">robots.txt and the XML sitemap are generated in code (a page set to noindex is left out of the sitemap automatically).</p>
    </>
  );
}
