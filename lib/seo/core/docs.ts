// The documents SEO Studio edits. Each is stored as one row in the existing
// drafts / published / history tables, keyed by:
//   "/"          page tags (title, description, robots, social…)
//   "@images"    alt text overrides { imageKey: alt }
//   "@business"  structured-data business details
// Pure module.

import { effectiveMeta, validateOverride, type EffectiveMeta, type MetaOverride } from "./metadata.ts";
import { effectiveAlts, validateAltOverrides } from "./images.ts";
import { BUSINESS_DEFAULTS, effectiveBusiness, validateBusiness, type BusinessInfo } from "./business.ts";
import { SITE_IMAGES } from "../../siteImages.ts";

export const DOC_KEYS = ["/", "@images", "@business"] as const;
export type DocKey = (typeof DOC_KEYS)[number];
export const DOC_LABELS: Record<DocKey, string> = { "/": "Home — Google & sharing", "@images": "Images & alt text", "@business": "Business info" };

export function isDocKey(k: unknown): k is DocKey {
  return typeof k === "string" && (DOC_KEYS as readonly string[]).includes(k);
}

export function validateDoc(key: DocKey, input: Record<string, unknown>, site: URL): object {
  if (key === "/") return validateOverride(input, site);
  if (key === "@images") return validateAltOverrides(input);
  return validateBusiness(input);
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
  ["name", "Name"], ["url", "Website"], ["telephone", "Phone"], ["email", "Email"], ["servesCuisine", "Cuisine"], ["priceRange", "Price range"],
  ["streetAddress", "Street"], ["addressLocality", "Area"], ["addressRegion", "City / region"], ["postalCode", "Postal code"], ["addressCountry", "Country"],
  ["latitude", "Latitude"], ["longitude", "Longitude"], ["openingHours", "Opening hours"],
];

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    return v.map((x) => (typeof x === "object" && x ? ("days" in x ? `${x.days} ${x.opens}–${x.closes}` : `${x.name}=${x.content}`) : String(x))).join(", ");
  }
  return String(v);
}

/** What visibly changes between two stored versions of a document. */
export function diffRows(key: DocKey, before: object | null, after: object | null, metaDefaults: EffectiveMeta): DiffRow[] {
  const rows: DiffRow[] = [];
  if (key === "/") {
    const a = effectiveMeta(metaDefaults, before as MetaOverride | null);
    const b = effectiveMeta(metaDefaults, after as MetaOverride | null);
    for (const [k, label] of META_LABELS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) rows.push({ label, before: show(a[k]), after: show(b[k]) });
  } else if (key === "@images") {
    const a = effectiveAlts(before as Record<string, string> | null);
    const b = effectiveAlts(after as Record<string, string> | null);
    for (const img of SITE_IMAGES) if (a[img.key] !== b[img.key]) rows.push({ label: `Alt — ${img.label}`, before: a[img.key] || "(empty)", after: b[img.key] || "(empty)" });
  } else {
    const a = effectiveBusiness(before as Partial<BusinessInfo> | null);
    const b = effectiveBusiness(after as Partial<BusinessInfo> | null);
    for (const [k, label] of BUSINESS_LABELS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) rows.push({ label, before: show(a[k]), after: show(b[k]) });
  }
  return rows;
}

export { BUSINESS_DEFAULTS };
