import type { Metadata } from "next";
import BusinessEditor from "@/components/seo/BusinessEditor";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import { businessWarnings, effectiveBusiness, type BusinessInfo } from "@/lib/seo/core/business";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { historyRows } from "@/lib/seo/services/docs";
import { getDraft, getOverride } from "@/lib/seo/services/metadata";
import { codeDefaults } from "@/lib/seo/services/verify";

export const metadata: Metadata = { title: "Business info" };

export default async function BusinessPage() {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Site" title="Business info" /><DbMissing /></>);
  const defaults = codeDefaults();
  const [published, draft, history] = await Promise.all([getOverride(db, "@business"), getDraft(db, "@business"), historyRows(db, "@business", defaults)]);
  const pub = (published?.fields as Partial<BusinessInfo> | undefined) ?? null;
  const dr = (draft?.fields as Partial<BusinessInfo> | undefined) ?? null;
  const warnings = businessWarnings(effectiveBusiness(dr ?? pub), `${defaults.title} ${defaults.description}`);
  return (
    <>
      <PageHead eyebrow="Site" title="Business info" lede="Name, address, phone and opening hours that Google reads from the website (structured data). Keep them the same as your Google Business Profile." />
      <BusinessEditor key={`${draft?.savedAt.toISOString() ?? ""}:${published?.version ?? 0}`} published={pub} draft={dr} canDraft={can(viewer.role, "metadata:draft")} warnings={warnings} />
      <HistoryPanel rows={history} canPublish={can(viewer.role, "metadata:publish")} title="Business info — publish history" />
    </>
  );
}
