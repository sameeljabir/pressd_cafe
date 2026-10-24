// Page metadata overrides: validation, merging over the code defaults, and the
// "effective" values the editor previews and verifies against.
// Pure module (no Next/Node imports) — shared by the public layout, the API,
// the browser editor and the tests.

export const ROBOTS_OPTIONS = ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"] as const;
export type RobotsDirective = (typeof ROBOTS_OPTIONS)[number];
export const OG_TYPES = ["website", "article"] as const;
export const TWITTER_CARDS = ["summary_large_image", "summary"] as const;

export interface ExtraMeta {
  name: string;
  content: string;
}

/** Everything the editor can override. Unset = keep the code default. */
export interface MetaOverride {
  title?: string;
  description?: string;
  keywords?: string;
  /** keywords are only rendered when explicitly enabled */
  keywordsEnabled?: boolean;
  canonical?: string;
  robots?: RobotsDirective;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: (typeof OG_TYPES)[number];
  twitterCard?: (typeof TWITTER_CARDS)[number];
  extraMeta?: ExtraMeta[];
}

const TEXT_FIELDS = { title: 120, description: 320, keywords: 300, ogTitle: 120, ogDescription: 320 } as const;
const KNOWN = new Set(["title", "description", "keywords", "keywordsEnabled", "canonical", "robots", "ogTitle", "ogDescription", "ogImage", "ogType", "twitterCard", "extraMeta"]);
export const MAX_EXTRA_META = 20;

/** Names that would duplicate or conflict with tags the editor already manages (or that are unsafe). */
const RESERVED_META = new Set([
  "description", "keywords", "robots", "googlebot", "googlebot-news", "bingbot", "slurp", "title", "viewport",
  "theme-color", "color-scheme", "referrer", "generator", "application-name", "format-detection", "canonical",
]);
const RESERVED_PREFIXES = ["og:", "twitter:", "fb:", "article:", "http-equiv"];

export class MetadataValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/;

function cleanText(v: unknown, field: string, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new MetadataValidationError(field, "Must be text");
  if (UNSAFE_TEXT.test(v)) throw new MetadataValidationError(field, "Angle brackets and control characters are not allowed");
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  if (s.length > max) throw new MetadataValidationError(field, `At most ${max} characters`);
  return s;
}

function siteUrlField(v: unknown, field: string, site: URL, kind: "canonical" | "image"): string | undefined {
  const s = cleanText(v, field, 500);
  if (!s) return undefined;
  let u: URL;
  try {
    u = new URL(s, site.origin);
  } catch {
    throw new MetadataValidationError(field, "Not a valid URL");
  }
  if (u.protocol !== "https:") throw new MetadataValidationError(field, "Must use https");
  if (u.username || u.password) throw new MetadataValidationError(field, "Must not contain credentials");
  if (u.host !== site.host) {
    const hint = u.hostname.replace(/^www\./, "") === site.hostname.replace(/^www\./, "") ? ` (use ${site.host} — the other hostname redirects)` : "";
    throw new MetadataValidationError(field, `Must be on ${site.host}${hint}`);
  }
  if (kind === "canonical" && (u.search || u.hash)) throw new MetadataValidationError(field, "Canonical must not include a query string or #fragment");
  if (kind === "image" && !/\.(jpe?g|png|webp|gif)$/i.test(u.pathname)) throw new MetadataValidationError(field, "Use a .jpg, .png, .webp or .gif image");
  return u.toString();
}

export function validateExtraMeta(v: unknown): ExtraMeta[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new MetadataValidationError("extraMeta", "Must be a list");
  if (v.length > MAX_EXTRA_META) throw new MetadataValidationError("extraMeta", `At most ${MAX_EXTRA_META} tags`);
  const out: ExtraMeta[] = [];
  const seen = new Set<string>();
  v.forEach((row, i) => {
    const field = `extraMeta.${i}`;
    if (!row || typeof row !== "object") throw new MetadataValidationError(field, "Invalid tag");
    const keys = Object.keys(row);
    if (keys.some((k) => k !== "name" && k !== "content")) throw new MetadataValidationError(field, "Only name and content are allowed");
    const { name, content } = row as Record<string, unknown>;
    if (typeof name !== "string" || !/^[a-zA-Z][a-zA-Z0-9._:-]{0,63}$/.test(name.trim()))
      throw new MetadataValidationError(field, "Name: letters, digits, . _ : - only (max 64), starting with a letter");
    const n = name.trim();
    const lower = n.toLowerCase();
    if (RESERVED_META.has(lower) || RESERVED_PREFIXES.some((p) => lower.startsWith(p)))
      throw new MetadataValidationError(field, `"${n}" is managed by the editor's own fields (or not allowed) — use those instead`);
    if (seen.has(lower)) throw new MetadataValidationError(field, `Duplicate tag "${n}"`);
    seen.add(lower);
    const c = cleanText(content, field, 500);
    if (!c) throw new MetadataValidationError(field, `"${n}" needs a value`);
    out.push({ name: n, content: c });
  });
  return out.length ? out : undefined;
}

/**
 * Validates an override (server and browser). Empty values mean "use the
 * default" and are dropped. Throws MetadataValidationError on the first problem.
 */
export function validateOverride(input: Record<string, unknown>, site: URL): MetaOverride {
  for (const key of Object.keys(input)) if (!KNOWN.has(key)) throw new MetadataValidationError(key, `Unknown field ${key}`);
  const out: MetaOverride = {};
  for (const [f, max] of Object.entries(TEXT_FIELDS) as [keyof typeof TEXT_FIELDS, number][]) {
    const s = cleanText(input[f], f, max);
    if (s) out[f] = s;
  }
  if (out.keywords) {
    const list = out.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (list.length > 20) throw new MetadataValidationError("keywords", "At most 20 keywords");
    out.keywords = [...new Set(list)].join(", ");
  }
  if (input.keywordsEnabled !== undefined && typeof input.keywordsEnabled !== "boolean") throw new MetadataValidationError("keywordsEnabled", "Must be true or false");
  if (input.keywordsEnabled === true) {
    if (!out.keywords) throw new MetadataValidationError("keywords", "Add keywords or turn the keywords tag off");
    out.keywordsEnabled = true;
  }
  const canonical = siteUrlField(input.canonical, "canonical", site, "canonical");
  if (canonical) out.canonical = canonical;
  const ogImage = siteUrlField(input.ogImage, "ogImage", site, "image");
  if (ogImage) out.ogImage = ogImage;
  if (input.robots !== undefined && input.robots !== null && input.robots !== "") {
    if (!(ROBOTS_OPTIONS as readonly unknown[]).includes(input.robots)) throw new MetadataValidationError("robots", `Must be one of: ${ROBOTS_OPTIONS.join(" | ")}`);
    if (input.robots !== "index, follow") out.robots = input.robots as RobotsDirective; // index, follow is the default
  }
  if (input.ogType !== undefined && input.ogType !== null && input.ogType !== "") {
    if (!(OG_TYPES as readonly unknown[]).includes(input.ogType)) throw new MetadataValidationError("ogType", `Must be one of: ${OG_TYPES.join(", ")}`);
    out.ogType = input.ogType as MetaOverride["ogType"];
  }
  if (input.twitterCard !== undefined && input.twitterCard !== null && input.twitterCard !== "") {
    if (!(TWITTER_CARDS as readonly unknown[]).includes(input.twitterCard)) throw new MetadataValidationError("twitterCard", `Must be one of: ${TWITTER_CARDS.join(", ")}`);
    out.twitterCard = input.twitterCard as MetaOverride["twitterCard"];
  }
  const extra = validateExtraMeta(input.extraMeta);
  if (extra) out.extraMeta = extra;
  return out;
}

/** Validates without throwing: returns the field → message map (empty = valid). */
export function overrideErrors(input: Record<string, unknown>, site: URL): Record<string, string> {
  try {
    validateOverride(input, site);
    return {};
  } catch (e) {
    if (e instanceof MetadataValidationError) return { [e.field]: e.message };
    return { _: "Invalid input" };
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Layers an override onto a Next.js Metadata object (typed structurally so
 * this module does not import Next). Unset fields keep the base values, so
 * with no override the output is exactly the base.
 */
export function applyOverride<T extends object>(base: T, o: MetaOverride | null | undefined): T {
  if (!o || !Object.keys(o).length) return base;
  const b = base as Record<string, unknown>;
  const m: Record<string, unknown> = { ...b };
  if (o.title) m.title = o.title;
  if (o.description) m.description = o.description;
  if (o.keywordsEnabled && o.keywords) m.keywords = o.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  if (o.canonical) m.alternates = { ...((b.alternates as object | null | undefined) ?? {}), canonical: o.canonical };
  if (o.robots) {
    const [index, follow] = o.robots.split(",").map((x) => x.trim());
    m.robots = { index: index === "index", follow: follow === "follow" };
  }
  const socialChanged = !!(o.ogTitle || o.ogDescription || o.ogImage || o.ogType || o.twitterCard);
  if (socialChanged) {
    const og = { ...((b.openGraph as Record<string, unknown> | null | undefined) ?? {}) };
    if (o.ogTitle) og.title = o.ogTitle;
    if (o.ogDescription) og.description = o.ogDescription;
    if (o.ogImage) og.images = [{ url: o.ogImage }];
    if (o.ogType) og.type = o.ogType;
    m.openGraph = og;
    // X/Twitter: stated explicitly from the resulting Open Graph values
    const images = og.images as { url: string }[] | undefined;
    m.twitter = {
      ...((b.twitter as object | null | undefined) ?? {}),
      card: o.twitterCard ?? (images?.length ? "summary_large_image" : "summary"),
      ...(str(og.title) ? { title: og.title } : {}),
      ...(str(og.description) ? { description: og.description } : {}),
      ...(images?.length ? { images: images.map((i) => i.url) } : {}),
    };
  }
  if (o.extraMeta?.length) {
    m.other = { ...((b.other as object | null | undefined) ?? {}), ...Object.fromEntries(o.extraMeta.map((t) => [t.name, t.content])) };
  }
  return m as T;
}

/** The values a page actually renders — used for previews, "currently live" and verification. */
export interface EffectiveMeta {
  title: string;
  description: string;
  keywords: string | null;
  canonical: string | null;
  robots: RobotsDirective;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogType: string;
  twitterCard: string;
  extraMeta: ExtraMeta[];
}

/** Code defaults (from the site's Metadata object) in EffectiveMeta form. */
export function defaultsFrom(meta: Record<string, unknown>, site: URL): EffectiveMeta {
  const og = (meta.openGraph ?? {}) as Record<string, unknown>;
  const alt = (meta.alternates ?? {}) as Record<string, unknown>;
  const img = Array.isArray(og.images) ? (og.images[0] as { url?: unknown } | undefined)?.url : undefined;
  const abs = (u: unknown) => (typeof u === "string" ? new URL(u, site.origin).toString() : u instanceof URL ? u.toString() : null);
  const title = str(meta.title) ?? "";
  const description = str(meta.description) ?? "";
  return {
    title,
    description,
    keywords: null,
    canonical: alt.canonical ? abs(alt.canonical) : null,
    robots: "index, follow",
    ogTitle: str(og.title) ?? title,
    ogDescription: str(og.description) ?? description,
    ogImage: img ? abs(img) : null,
    ogType: str(og.type) ?? "website",
    twitterCard: img ? "summary_large_image" : "summary",
    extraMeta: [],
  };
}

export function effectiveMeta(defaults: EffectiveMeta, o: MetaOverride | null | undefined): EffectiveMeta {
  if (!o) return defaults;
  const ogImage = o.ogImage ?? defaults.ogImage;
  const social = !!(o.ogTitle || o.ogDescription || o.ogImage || o.ogType || o.twitterCard);
  return {
    title: o.title ?? defaults.title,
    description: o.description ?? defaults.description,
    keywords: o.keywordsEnabled && o.keywords ? o.keywords : null,
    canonical: o.canonical ?? defaults.canonical,
    robots: o.robots ?? defaults.robots,
    ogTitle: o.ogTitle ?? defaults.ogTitle,
    ogDescription: o.ogDescription ?? defaults.ogDescription,
    ogImage,
    ogType: o.ogType ?? defaults.ogType,
    twitterCard: social ? (o.twitterCard ?? (ogImage ? "summary_large_image" : "summary")) : defaults.twitterCard,
    extraMeta: o.extraMeta ?? [],
  };
}

export interface Thresholds {
  titleMin: number;
  titleMax: number;
  descriptionMin: number;
  descriptionMax: number;
}

export type LengthStatus = "empty" | "short" | "good" | "long";
export function lengthStatus(len: number, min: number, max: number): LengthStatus {
  if (!len) return "empty";
  if (len < min) return "short";
  if (len > max) return "long";
  return "good";
}

/** Non-blocking advice shown before publishing. */
export function overrideWarnings(o: MetaOverride, eff: EffectiveMeta, t: Thresholds, site: URL, pagePath: string): string[] {
  const w: string[] = [];
  const ts = lengthStatus(eff.title.length, t.titleMin, t.titleMax);
  if (ts === "long") w.push(`Title is ${eff.title.length} characters — search engines often cut titles longer than about ${t.titleMax}.`);
  if (ts === "short") w.push(`Title is only ${eff.title.length} characters.`);
  const ds = lengthStatus(eff.description.length, t.descriptionMin, t.descriptionMax);
  if (ds === "long") w.push(`Description is ${eff.description.length} characters — likely to be shortened in results.`);
  if (ds === "short") w.push(`Description is only ${eff.description.length} characters.`);
  if (o.canonical) {
    const c = new URL(o.canonical);
    const expected = new URL(pagePath, site.origin);
    if (c.pathname !== expected.pathname) w.push(`Canonical points to ${c.pathname}, not this page (${expected.pathname}). Search engines may index that URL instead.`);
  }
  if (eff.robots.startsWith("noindex")) w.push("noindex: this page will be removed from Google and from the sitemap.");
  if (eff.robots.endsWith("nofollow")) w.push("nofollow: search engines won't follow links on this page.");
  if (eff.keywords) w.push("The meta keywords tag will be rendered. Google Search does not use it for ranking.");
  return w;
}

/** Characters are approximations; Google decides what it actually shows. */
export function snippetPreview(title: string, description: string) {
  return {
    title: title.length > 60 ? title.slice(0, 57).trimEnd() + "…" : title,
    description: description.length > 158 ? description.slice(0, 155).trimEnd() + "…" : description,
    titleTruncated: title.length > 60,
    descriptionTruncated: description.length > 158,
  };
}

/** Rendered-HTML facts relevant to verification (filled from DOMParser or htmlparser2). */
export interface RenderedMeta {
  title: string | null;
  description: string | null;
  keywords: string | null;
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogType: string | null;
  twitterCard: string | null;
  other: Record<string, string>;
}

/** Lists differences between what should be live and what the page rendered. */
export function compareEffective(expected: EffectiveMeta, r: RenderedMeta): string[] {
  const out: string[] = [];
  const sameUrl = (a: string | null, b: string | null) => {
    if (!a || !b) return a === b;
    try {
      return new URL(a).href === new URL(b).href;
    } catch {
      return false;
    }
  };
  if (r.title !== expected.title) out.push(`title is "${r.title ?? "(none)"}"`);
  if (r.description !== expected.description) out.push(`description is "${r.description ?? "(none)"}"`);
  const kw = (s: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean).join(",");
  if (kw(r.keywords) !== kw(expected.keywords)) out.push(`keywords tag is "${r.keywords ?? "(none)"}"`);
  if (!sameUrl(r.canonical, expected.canonical)) out.push(`canonical is "${r.canonical ?? "(none)"}"`);
  const robotsRendered = (r.robots ?? "index, follow").replace(/\s+/g, "");
  if (robotsRendered !== expected.robots.replace(/\s+/g, "")) out.push(`robots is "${r.robots ?? "(none — index, follow)"}"`);
  if (r.ogTitle !== expected.ogTitle) out.push(`og:title is "${r.ogTitle ?? "(none)"}"`);
  if (r.ogDescription !== expected.ogDescription) out.push(`og:description is "${r.ogDescription ?? "(none)"}"`);
  if (!sameUrl(r.ogImage, expected.ogImage)) out.push(`og:image is "${r.ogImage ?? "(none)"}"`);
  if (r.ogType !== expected.ogType) out.push(`og:type is "${r.ogType ?? "(none)"}"`);
  if (r.twitterCard !== expected.twitterCard) out.push(`twitter:card is "${r.twitterCard ?? "(none)"}"`);
  for (const t of expected.extraMeta) if (r.other[t.name] !== t.content) out.push(`meta "${t.name}" is "${r.other[t.name] ?? "(missing)"}"`);
  return out;
}
