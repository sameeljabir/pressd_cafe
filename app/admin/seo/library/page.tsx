import type { Metadata } from "next";
import PageHead from "@/components/seo/PageHead";
import LibraryBrowser from "@/components/seo/cms/LibraryBrowser";
import { requirePage } from "@/lib/seo/auth/guard";
import { PAGE_SCHEMAS } from "@/lib/content/pages";
import { effectiveShared, type ContentDoc } from "@/lib/content/schema";
import type { MenuOverrides } from "@/lib/content/menu";
import { MENU_KEY, effectiveMenuFor } from "@/lib/seo/core/docs";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { getOverride } from "@/lib/seo/services/metadata";

export const metadata: Metadata = { title: "Image library" };

export default async function LibraryPage() {
  await requirePage("reports:read");
  const db = await dbOrNull();
  // Where each image is used on the live website through SEO Studio (pages and menu).
  const assigned: Record<string, string[]> = {};
  const add = (src: string, where: string) => (assigned[src.split("?")[0]] ??= []).includes(where) || assigned[src.split("?")[0]].push(where);
  const docs = db ? await Promise.all([...PAGE_SCHEMAS.map((s) => getOverride(db, s.key)), getOverride(db, MENU_KEY)]) : [];
  PAGE_SCHEMAS.forEach((s, i) => {
    const shared = effectiveShared(s, (docs[i]?.fields as ContentDoc | undefined) ?? null);
    for (const [f, spec] of Object.entries(s.fields)) if (spec.kind === "image") add(String(shared[f]), s.label);
  });
  const menu = effectiveMenuFor((docs[PAGE_SCHEMAS.length]?.fields as MenuOverrides | undefined) ?? null);
  for (const c of menu.all) for (const it of c.items) add(it[3], "Menu");
  return (
    <>
      <PageHead
        eyebrow="Site"
        title="Image library"
        lede="Every image already in the website project. Photos for pages and menu products are chosen from here. Uploading is not available — new images are added to the project by the developer."
      />
      <LibraryBrowser assigned={assigned} />
    </>
  );
}
