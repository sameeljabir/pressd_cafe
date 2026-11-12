// The documents SEO Studio edits. Each is stored as one row in the existing
// drafts / published / history collections, keyed by:
//   "/"                      page tags (title, description, robots, social…)
//   "@images"                alt text overrides { imageKey: alt }
//   "@business"              business details (structured data + visible contact details)
//   "@content:<section>"     page content (hero, about, visit, footer, navigation, booking)
//   "@content:menu"          menu overrides (products, prices, nutrition, categories)
//   "@content:translations"  menu translations for the 12 languages
// Every document goes through the same Draft → Confirm & Publish → History → Restore flow.
// Pure module (server-side only: it loads the menu and all 12 dictionaries).

import { effectiveMeta, validateOverride, type EffectiveMeta, type MetaOverride } from "./metadata.ts";
import { effectiveAlts, validateAltOverrides } from "./images.ts";
import { BUSINESS_DEFAULTS, effectiveBusiness, validateBusiness, type BusinessInfo } from "./business.ts";
import type { Permission } from "./permissions.ts";
import { SITE_IMAGES } from "../../siteImages.ts";
import { PAGE_BY_KEY, PAGE_KEYS, PAGE_SCHEMAS, type PageKey } from "../../content/pages.ts";
import { contentDiff, validateContent, type ContentDoc } from "../../content/schema.ts";
import { LIBRARY_SRCS } from "../../content/library.ts";
import { buildEffectiveMenu, menuDiff, validateMenu, type EffectiveMenu, type MenuOverrides } from "../../content/menu.ts";
import { validateTranslations, type Translations } from "../../content/translations.ts";
import { ENGLISH } from "../../content/dictionaries.ts";
import { menu as BASE_MENU } from "../../../data/menu.ts";

export const SEO_DOC_KEYS = ["/", "@images", "@business"] as const;
export const MENU_KEY = "@content:menu";
export const TRANSLATIONS_KEY = "@content:translations";
/** Publishing order matters: the menu goes before its translations. */
export const DOC_KEYS = [...SEO_DOC_KEYS, ...PAGE_KEYS, MENU_KEY, TRANSLATIONS_KEY] as const;
export type DocKey = (typeof SEO_DOC_KEYS)[number] | PageKey | typeof MENU_KEY | typeof TRANSLATIONS_KEY;

export const DOC_LABELS: Record<DocKey, string> = {
  "/": "Home — Google & sharing",
  "@images": "Images & alt text",
  "@business": "Business info",
  ...(Object.fromEntries(PAGE_SCHEMAS.map((s) => [s.key, `Page content — ${s.label}`])) as Record<PageKey, string>),
  [MENU_KEY]: "Menu — products & categories",
  [TRANSLATIONS_KEY]: "Menu translations",
};

export function isDocKey(k: unknown): k is DocKey {
  return typeof k === "string" && (DOC_KEYS as readonly string[]).includes(k);
}

export const isContentKey = (k: string) => k.startsWith("@content:");

/** Which permission saving (draft) or publishing a document needs. */
export function docPermission(key: DocKey, action: "draft" | "publish"): Permission {
  return isContentKey(key) ? (action === "draft" ? "content:draft" : "content:publish") : action === "draft" ? "metadata:draft" : "metadata:publish";
}

/** Largest accepted draft body per document (bytes). */
export const docBodyLimit = (key: DocKey) => (key === MENU_KEY || key === TRANSLATIONS_KEY ? 1_000_000 : 64_000);

export interface DocContext {
  /** Menu overrides the translations are checked against (the menu being saved/published, else the live one). */
  menu?: MenuOverrides | null;
}

export function effectiveMenuFor(menu: MenuOverrides | null | undefined): EffectiveMenu {
  return buildEffectiveMenu(BASE_MENU, menu);
}

export function validateDoc(key: DocKey, input: Record<string, unknown>, site: URL, ctx: DocContext = {}): object {
  if (key === "/") return validateOverride(input, site);
  if (key === "@images") return validateAltOverrides(input);
  if (key === "@business") return validateBusiness(input);
  if (key === MENU_KEY) return validateMenu(input, BASE_MENU);
  if (key === TRANSLATIONS_KEY) return validateTranslations(input, { menu: effectiveMenuFor(ctx.menu), english: ENGLISH });
  return validateContent(PAGE_BY_KEY.get(key)!, input, { images: LIBRARY_SRCS });
}

export interface DiffRow {
  label: string;
  before: string;
  after: string;
}

const META_LABELS: [keyof EffectiveMeta, string][] = [
  ["title", "Title"], ["description", "Description"], ["canonical", "Canonical URL"], ["robots", "Robots"], ["keywords", "Meta keywords"],
  ["ogTitle", "Share title"], ["ogDescription", "Share description"], ["ogImage", "Share image"], ["ogType", "og:type"], ["twitterCard", "X card"], ["extraMeta", "Additional tags"],
];
const BUSINESS_LABELS: [keyof BusinessInfo, string][] = [
  ["name", "Name"], ["url", "Website"], ["telephone", "Phone"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["servesCuisine", "Cuisine"], ["priceRange", "Price range"],
  ["streetAddress", "Street"], ["addressLocality", "Area"], ["addressRegion", "City / region"], ["postalCode", "Postal code"], ["addressCountry", "Country"],
  ["addressLines", "Address as shown"], ["latitude", "Latitude"], ["longitude", "Longitude"], ["openingHours", "Opening hours"],
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["threads", "Threads"], ["mapsUrl", "Google Maps link"],
];

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    return v.map((x) => (typeof x === "object" && x ? ("days" in x ? `${x.days} ${x.opens}–${x.closes}` : `${x.name}=${x.content}`) : String(x))).join(", ");
  }
  return String(v);
}

/** Flattens a translations document to "locale · section · key" → text. */
function flattenTranslations(t: Translations | null, menu: EffectiveMenu): Map<string, string> {
  const out = new Map<string, string>();
  for (const [locale, ov] of Object.entries(t ?? {})) {
    for (const [id, p] of Object.entries(ov.products ?? {})) {
      const name = menu.byId.get(id)?.item[0] ?? id;
      if (p.name) out.set(`${locale} · ${name} · Name`, p.name);
      if (p.description) out.set(`${locale} · ${name} · Description`, p.description);
      if (p.ingredients) out.set(`${locale} · ${name} · Ingredients`, p.ingredients.join(", "));
    }
    for (const section of ["categories", "categoryTaglines", "subcategories", "ui"] as const) for (const [k, v] of Object.entries(ov[section] ?? {})) out.set(`${locale} · ${section} · ${k}`, v);
    for (const [g, m] of Object.entries(ov.customization ?? {})) for (const [k, v] of Object.entries(m ?? {})) out.set(`${locale} · ${g} · ${k}`, v);
  }
  return out;
}

/** What visibly changes between two stored versions of a document. */
export function diffRows(key: DocKey, before: object | null, after: object | null, metaDefaults: EffectiveMeta, ctx: DocContext = {}): DiffRow[] {
  const rows: DiffRow[] = [];
  if (key === "/") {
    const a = effectiveMeta(metaDefaults, before as MetaOverride | null);
    const b = effectiveMeta(metaDefaults, after as MetaOverride | null);
    for (const [k, label] of META_LABELS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) rows.push({ label, before: show(a[k]), after: show(b[k]) });
  } else if (key === "@images") {
    const a = effectiveAlts(before as Record<string, string> | null);
    const b = effectiveAlts(after as Record<string, string> | null);
    for (const img of SITE_IMAGES) if (a[img.key] !== b[img.key]) rows.push({ label: `Alt — ${img.label}`, before: a[img.key] || "(empty)", after: b[img.key] || "(empty)" });
  } else if (key === "@business") {
    const a = effectiveBusiness(before as Partial<BusinessInfo> | null);
    const b = effectiveBusiness(after as Partial<BusinessInfo> | null);
    for (const [k, label] of BUSINESS_LABELS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) rows.push({ label, before: show(a[k]), after: show(b[k]) });
  } else if (key === MENU_KEY) {
    rows.push(...menuDiff(BASE_MENU, before as MenuOverrides | null, after as MenuOverrides | null));
  } else if (key === TRANSLATIONS_KEY) {
    const menu = effectiveMenuFor(ctx.menu);
    const a = flattenTranslations(before as Translations | null, menu);
    const b = flattenTranslations(after as Translations | null, menu);
    for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) rows.push({ label: `Translation · ${k}`, before: a.get(k) ?? "— (English)", after: b.get(k) ?? "— (English)" });
  } else {
    rows.push(...contentDiff(PAGE_BY_KEY.get(key)!, before as ContentDoc | null, after as ContentDoc | null));
  }
  return rows;
}

export { BUSINESS_DEFAULTS };
