import type { Metadata } from "next";
import DbMissing from "@/components/seo/DbMissing";
import KeywordManager from "@/components/seo/KeywordManager";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { listKeywords } from "@/lib/seo/services/keywords";

export const metadata: Metadata = { title: "Keywords" };

export default async function KeywordsPage() {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="SEO" title="Keywords" /><DbMissing /></>);
  const rows = await listKeywords(db);
  return (
    <>
      <PageHead
        eyebrow="SEO"
        title="Keywords"
        lede="Plan which phrases each part of the site targets. Saved straight away for the whole team; nothing here is added to the website. The optional meta keywords tag is set separately under Google & sharing."
      />
      <KeywordManager initial={rows} canEdit={can(viewer.role, "metadata:draft")} />
    </>
  );
}
