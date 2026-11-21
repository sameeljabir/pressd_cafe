import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/siteMetadata";
import { publishedOverride } from "@/lib/seo/public";
import { publicPosts } from "@/lib/blog/public";
import { isIndexable } from "@/lib/blog/post";

// Indexable URLs only: the home page (unless published as noindex), the journal
// and every public, indexable article (not drafts, unpublished, archived,
// scheduled-for-later, noindex or canonicalised elsewhere).
// About, Menu, Visit etc. are #sections of the home page, not pages.
// Publishing revalidates this file; the 5-minute revalidation also picks up
// scheduled articles once their time has passed.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = new URL(SITE_ORIGIN);
  const [home, posts] = await Promise.all([publishedOverride("/"), publicPosts()]);
  const out: MetadataRoute.Sitemap = [];
  if (!home?.robots?.startsWith("noindex")) out.push({ url: `${SITE_ORIGIN}/` });
  const articles = posts.filter((p) => isIndexable(p, site));
  out.push({ url: `${SITE_ORIGIN}/blog`, ...(articles[0] ? { lastModified: articles.map((p) => p.updatedAt).sort().at(-1) } : {}) });
  for (const p of articles) out.push({ url: `${SITE_ORIGIN}/blog/${p.slug}`, lastModified: p.updatedAt });
  return out;
}
