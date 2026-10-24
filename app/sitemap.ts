import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/siteMetadata";
import { publishedOverride } from "@/lib/seo/public";

// The public site has one indexable URL. About, Menu, Visit etc. are #sections of
// it, not pages, so they are not listed. No lastModified: it isn't tracked, and a
// build timestamp would misstate when the content changed.
// A page set to "noindex" in the SEO editor is left out (publishing revalidates this file).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home = await publishedOverride("/");
  if (home?.robots?.startsWith("noindex")) return [];
  return [{ url: `${SITE_ORIGIN}/` }];
}
