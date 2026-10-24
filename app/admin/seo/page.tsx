import type { Metadata } from "next";
import Link from "next/link";
import DbMissing from "@/components/seo/DbMissing";
import PageHead from "@/components/seo/PageHead";
import { fmtDateServer } from "@/lib/seo/format";
import { requirePage } from "@/lib/seo/auth/guard";
import { businessWarnings, effectiveBusiness, type BusinessInfo } from "@/lib/seo/core/business";
import { altStatus, altSummary, effectiveAlts } from "@/lib/seo/core/images";
import { effectiveMeta, lengthStatus, overrideWarnings, type MetaOverride } from "@/lib/seo/core/metadata";
import { siteUrl } from "@/lib/seo/env";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { getOverride, PUBLIC_PAGES } from "@/lib/seo/services/metadata";
import { pendingChanges } from "@/lib/seo/services/docs";
import { getSettings } from "@/lib/seo/services/settings";
import { codeDefaults } from "@/lib/seo/services/verify";
import { SITE_IMAGES, SITE_SECTIONS } from "@/lib/siteImages";

export const metadata: Metadata = { title: "Overview" };

interface Issue {
  text: string;
  href: string;
  fix: string;
}

export default async function Overview() {
  await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="SEO Studio" title="Overview" /><DbMissing /></>);
  const site = siteUrl();
  const defaults = codeDefaults();
  const [meta, images, business, settings] = await Promise.all([getOverride(db, "/"), getOverride(db, "@images"), getOverride(db, "@business"), getSettings(db)]);
  const pending = await pendingChanges(db, defaults, settings.thresholds, site);
  const t = settings.thresholds;

  // Everything below describes what is live on the website now.
  const live = effectiveMeta(defaults, (meta?.fields as MetaOverride | undefined) ?? null);
  const metaIssues = overrideWarnings((meta?.fields as MetaOverride | undefined) ?? {}, live, t, site, "/");
  const alts = effectiveAlts((images?.fields as Record<string, string> | undefined) ?? null);
  const alt = altSummary((images?.fields as Record<string, string> | undefined) ?? null);
  const biz = businessWarnings(effectiveBusiness((business?.fields as Partial<BusinessInfo> | undefined) ?? null), `${defaults.title} ${defaults.description}`);
  const tdOk = lengthStatus(live.title.length, t.titleMin, t.titleMax) === "good" && lengthStatus(live.description.length, t.descriptionMin, t.descriptionMax) === "good";

  const issues: Issue[] = [
    ...metaIssues.map((text) => ({ text, href: "/admin/seo/pages?path=%2F&tab=seo", fix: "Edit tags" })),
    ...SITE_SECTIONS.flatMap((s) => {
      const bad = SITE_IMAGES.filter((i) => i.section === s.id && ["missing", "short"].includes(altStatus(alts[i.key], i.alt === "")));
      return bad.length ? [{ text: `${s.label}: ${bad.length} image${bad.length > 1 ? "s" : ""} missing good alt text (${bad.map((i) => i.label).join(", ")})`, href: `/admin/seo/pages?path=%2F&tab=${s.id}`, fix: "Fix alt text" }] : [];
    }),
    ...biz.map((text) => ({ text, href: "/admin/seo/business", fix: "Edit business info" })),
  ];

  return (
    <>
      <PageHead eyebrow="SEO Studio" title="Overview" lede="How the PRESS'D website looks to Google right now. Edit a page or section, Save, then use Confirm & Publish in the top bar." />
      <div className="stat-grid">
        <div className="stat"><span className="stat-label">Pages</span><span className="stat-value">{PUBLIC_PAGES.length}</span><span className="small faint">{SITE_SECTIONS.length} sections</span></div>
        <div className={`stat ${issues.length ? "stat-warn" : "stat-good"}`}><span className="stat-label">SEO issues</span><span className="stat-value">{issues.length}</span><span className="small faint">{issues.length ? "see the list below" : "nothing to fix"}</span></div>
        <div className={`stat ${alt.needsWork ? "stat-warn" : "stat-good"}`}><span className="stat-label">Images missing good alt text</span><span className="stat-value">{alt.needsWork}<small> / {alt.total}</small></span><Link className="small" href="/admin/seo/images">Images &amp; alt text →</Link></div>
        <div className={`stat ${pending.length ? "stat-warn" : ""}`}><span className="stat-label">Saved, not published</span><span className="stat-value">{pending.length}</span><span className="small faint">{pending.length ? pending.map((p) => p.label).join(", ") : "website is up to date"}</span></div>
      </div>

      <section className="card">
        <h2 className="section">Pages</h2>
        <ul className="page-list">
          {PUBLIC_PAGES.map((p) => (
            <li key={p.path}>
              <Link href="/admin/seo/pages?path=%2F&tab=seo" className="page-list-main">
                <b>{p.label}</b>
                <span className="small faint wrap-anywhere">{new URL(p.path, site).toString()}</span>
                <span className="small">{live.title}</span>
              </Link>
              <span className="page-list-tags">
                <span className={`tag ${tdOk ? "tag-good" : "tag-amber"}`}>{tdOk ? "Title & description OK" : "Check title & description"}</span>
                <span className={`tag ${live.robots.startsWith("noindex") ? "tag-bad" : "tag-good"}`}>{live.robots.startsWith("noindex") ? "Hidden from Google" : "Shown in Google"}</span>
                <span className="small faint">{meta ? `v${meta.version} · ${fmtDateServer(meta.publishedAt)}` : "code defaults"}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="chip-row" aria-label="Sections of the home page">
          {SITE_SECTIONS.filter((s) => SITE_IMAGES.some((i) => i.section === s.id)).map((s) => (
            <Link key={s.id} className="chip" href={`/admin/seo/pages?path=%2F&tab=${s.id}`}>{s.label}</Link>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section">SEO issues on the live website</h2>
        {issues.length ? (
          <ul className="issue-list">
            {issues.map((i) => (
              <li key={i.text}><span>{i.text}</span><Link className="btn btn-sm" href={i.href}>{i.fix}</Link></li>
            ))}
          </ul>
        ) : <div className="empty">No issues found. 🎉</div>}
      </section>
      <p className="small faint">robots.txt and the XML sitemap are managed in code (a page set to noindex is automatically left out of the sitemap). Section wording stays in the code.</p>
    </>
  );
}
