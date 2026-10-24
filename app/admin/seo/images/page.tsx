import type { Metadata } from "next";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import ImagesEditor from "@/components/seo/ImagesEditor";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import { altSummary } from "@/lib/seo/core/images";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { historyRows } from "@/lib/seo/services/docs";
import { getDraft, getOverride } from "@/lib/seo/services/metadata";
import { codeDefaults } from "@/lib/seo/services/verify";

export const metadata: Metadata = { title: "Images & alt text" };

export default async function ImagesPage() {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Site" title="Images & alt text" /><DbMissing /></>);
  const [published, draft, history] = await Promise.all([getOverride(db, "@images"), getDraft(db, "@images"), historyRows(db, "@images", codeDefaults())]);
  const pub = (published?.fields as Record<string, string> | undefined) ?? null;
  const dr = (draft?.fields as Record<string, string> | undefined) ?? null;
  const s = altSummary(pub);
  return (
    <>
      <PageHead
        eyebrow="Site"
        title="Images & alt text"
        lede={`Alt text tells Google and screen readers what each photo shows. ${s.needsWork ? `${s.needsWork} of ${s.total} images on the website are missing good alt text.` : `All ${s.total} images on the website have good alt text.`}`}
      />
      <ImagesEditor key={`${draft?.savedAt.toISOString() ?? ""}:${published?.version ?? 0}`} published={pub} draft={dr} canDraft={can(viewer.role, "metadata:draft")} filterable linkToPage />
      <HistoryPanel rows={history} canPublish={can(viewer.role, "metadata:publish")} title="Alt text — publish history" />
    </>
  );
}
