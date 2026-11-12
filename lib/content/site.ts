// Everything the public page renders from SEO Studio, resolved on the server:
// page content, business info, the effective menu and menu translations.
// Pure module: the raw documents are passed in (see lib/content/load.ts).

import type { MenuCategory } from "../../data/menu.ts";
import { BUSINESS_DEFAULTS, effectiveBusiness, type BusinessInfo } from "../seo/core/business.ts";
import { effectiveAlts } from "../seo/core/images.ts";
import { SITE_IMAGES } from "../siteImages.ts";
import { PAGE_SCHEMAS, type PageKey } from "./pages.ts";
import { effectiveShared, resolveContent, type ContentDoc } from "./schema.ts";
import { buildEffectiveMenu, type MenuOverrides } from "./menu.ts";
import type { Translations } from "./translations.ts";

export const SITE_DOC_KEYS = ["/", "@images", "@business", ...PAGE_SCHEMAS.map((s) => s.key), "@content:menu", "@content:translations"] as const;

/** Serializable data handed to the client components (published, or drafts in preview). */
export interface SiteContent {
  pages: Partial<Record<PageKey, ContentDoc>>;
  business: BusinessInfo;
  /** The published menu; null = nothing published (the client uses the code menu it already has). */
  menu: MenuCategory[] | null;
  /** Hidden products stay resolvable for carts saved before they were hidden. */
  hiddenItems: MenuCategory["items"];
  subcategoryNames: Record<string, string> | null;
  translations: Translations;
  preview: boolean;
}

export function buildSiteContent(docs: Record<string, unknown>, base: readonly MenuCategory[], preview: boolean): SiteContent {
  const pages: Partial<Record<PageKey, ContentDoc>> = {};
  for (const s of PAGE_SCHEMAS) if (docs[s.key]) pages[s.key] = docs[s.key] as ContentDoc;
  const overrides = (docs["@content:menu"] as MenuOverrides | undefined) ?? null;
  const menu = buildEffectiveMenu(base, overrides);
  return {
    pages,
    business: effectiveBusiness((docs["@business"] as Partial<BusinessInfo> | undefined) ?? null),
    menu: overrides ? menu.categories : null,
    hiddenItems: menu.all.flatMap((c) => c.items.filter((it) => menu.hidden.has(it[7]) || menu.hiddenCategories.has(c.slug))),
    subcategoryNames: overrides ? menu.subcategoryNames : null,
    translations: (docs["@content:translations"] as Translations | undefined) ?? {},
    preview,
  };
}

/**
 * Images the page renders with an alt-text key, with the src currently
 * assigned in page content (the registry's src is the code default).
 */
export function effectiveSiteImages(pages: SiteContent["pages"], altOverrides: Record<string, string> | null) {
  const alts = effectiveAlts(altOverrides);
  const assigned = new Map<string, string>();
  for (const s of PAGE_SCHEMAS) {
    const shared = effectiveShared(s, pages[s.key] ?? null);
    for (const [field, spec] of Object.entries(s.fields)) if (spec.kind === "image") assigned.set(spec.altKey, shared[field] as string);
  }
  return SITE_IMAGES.map((i) => ({ key: i.key, label: i.label, src: assigned.get(i.key) ?? i.src, alt: alts[i.key] ?? i.alt }));
}

/** Text paths that are not rendered as plain page text (placeholders, messages, URLs, states shown after an action). */
const NOT_RENDERED = new Set(["namePlaceholder", "phonePlaceholder", "submitted", "confirmation", "messageIntro", "whatsappMessage", "dockWhatsappMessage", "emailSubject"]);
/** Text shown only while a toggle is on. */
const SHOWN_BY: Record<string, string> = { pull: "showPull", note: "showNote", footLocation: "showFoot", footCopy: "showFoot", reviewsLabel: "showReviews", reviewsCount: "showReviews", reviewsLink: "showReviews" };
const IMAGE_SHOWN_BY: Record<string, string> = { "about.story.interior": "showPhoto" };

/**
 * What the published page must contain after a publish (checked in the
 * browser by SEO Studio's live check): every image with its current file and
 * alt text, the English page text, and the visible product names.
 */
export function expectedContent(pages: SiteContent["pages"], altOverrides: Record<string, string> | null, menu: readonly MenuCategory[]) {
  const shared: Record<string, unknown> = {};
  const texts = new Set<string>();
  for (const s of PAGE_SCHEMAS) {
    const r = resolveContent(s, pages[s.key] ?? null, "en");
    Object.assign(shared, r.shared);
    for (const [path, value] of Object.entries(r.text)) {
      const field = path.split(".").pop()!;
      const top = path.split(".")[0];
      if (NOT_RENDERED.has(top) || NOT_RENDERED.has(field)) continue;
      if (SHOWN_BY[top] && r.shared[SHOWN_BY[top]] === false) continue;
      if (value) texts.add(value);
    }
  }
  for (const c of menu) for (const it of c.items) texts.add(it[0]);
  const images = effectiveSiteImages(pages, altOverrides).filter((i) => !(IMAGE_SHOWN_BY[i.key] && shared[IMAGE_SHOWN_BY[i.key]] === false));
  return { images, texts: [...texts] };
}

export { BUSINESS_DEFAULTS };
