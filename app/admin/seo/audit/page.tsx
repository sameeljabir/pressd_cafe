import type { Metadata } from "next";
import { headers } from "next/headers";
import AuditRunner from "@/components/seo/AuditRunner";
import DbMissing from "@/components/seo/DbMissing";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { siteUrl } from "@/lib/seo/env";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { auditHistory, latestAudit } from "@/lib/seo/services/siteAudit";

export const metadata: Metadata = { title: "Technical audit" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="SEO" title="Technical audit" /><DbMissing /></>);
  const sp = await searchParams;
  const h = await headers();
  const appOrigin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;
  const site = siteUrl();
  const [live, app, liveH, appH] = await Promise.all([latestAudit(db, "live"), latestAudit(db, "app"), auditHistory(db, "live"), auditHistory(db, "app")]);
  return (
    <>
      <PageHead eyebrow="SEO" title="Technical audit" lede="Checks the HTML, robots.txt, sitemap, links and redirects that a crawler actually receives, at the moment you run it." />
      <AuditRunner
        targets={[
          { id: "live", label: `Live domain (${site.host})`, url: `${site.origin}/`, note: "what Google and visitors receive today (through the CDN cache)." },
          { id: "app", label: "This deployment", url: `${appOrigin}/`, note: "the site this dashboard publishes to — use it to confirm published changes." },
        ]}
        initial={{ live, app }}
        history={{ live: liveH, app: appH }}
        canRun={can(viewer.role, "audit:run")}
        initialTarget={sp.target === "app" ? "app" : "live"}
      />
    </>
  );
}
