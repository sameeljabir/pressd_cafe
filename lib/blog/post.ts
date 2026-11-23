// Blog posts: the stored document, validation, status, change rows, SEO
// analysis and structured data. Pure module (no Next/Node/DB imports): shared
// by the API, the public pages, the dashboard and the tests.
//
// A post is one SEO Studio document keyed "@blog:<id>". Its draft lives in the
// drafts collection and its live version in the published collection — the
// same Save → Confirm & Publish → History → Restore flow as every other screen.

import { MetadataValidationError, dedupeKeywords } from "../seo/core/metadata.ts";
import { ContentValidationError, contentFacts, emptyDoc, isAllowedImageSrc, isInternalHref, readingMinutes, validateContent, type RichNode } from "./content.ts";

export const BLOG_PREFIX = "@blog:";
export const isBlogKey = (k: unknown): k is `@blog:${string}` => typeof k === "string" && /^@blog:[0-9a-f]{24}$/.test(k);
export const blogKey = (id: string) => `${BLOG_PREFIX}${id}`;
export const blogId = (key: string) => key.slice(BLOG_PREFIX.length);
export const isPostId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);

/** Public visibility once published. */
export const POST_STATES = ["live", "unpublished", "archived"] as const;
export type PostState = (typeof POST_STATES)[number];

export interface PostSeo {
  title: string;
  description: string;
  focusKeyword: string;
  secondaryKeywords: string[];
  canonical: string;
  index: boolean;
  follow: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard: "summary_large_image" | "summary";
}

export interface BlogPost {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: string;
  coverImage: string;
  coverAlt: string;
  /** ISO date-time (UTC). Empty = set to the moment it is first published. */
  publishDate: string;
  featured: boolean;
  state: PostState;
  content: RichNode;
  seo: PostSeo;
  /** set once when the post is created */
  createdAt: string;
}

export const EMPTY_SEO: PostSeo = {
  title: "", description: "", focusKeyword: "", secondaryKeywords: [], canonical: "", index: true, follow: true,
  ogTitle: "", ogDescription: "", ogImage: "", twitterCard: "summary_large_image",
};

export function emptyPost(now = new Date()): BlogPost {
  return {
    title: "", slug: "", excerpt: "", category: "", tags: [], author: "PRESS'D", coverImage: "", coverAlt: "",
    publishDate: "", featured: false, state: "live", content: emptyDoc(), seo: { ...EMPTY_SEO }, createdAt: now.toISOString(),
  };
}

/** Reserved first path segments under /blog (routes that exist or may exist). */
const RESERVED_SLUGS = new Set(["preview", "category", "tag", "feed", "rss", "page"]);

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/;
function text(v: unknown, field: string, max: number, required = false): string {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") throw new MetadataValidationError(field, "Must be text");
  if (UNSAFE.test(v)) throw new MetadataValidationError(field, "Angle brackets and control characters are not allowed");
  const s = v.replace(/\s+/g, " ").trim();
  if (required && !s) throw new MetadataValidationError(field, "Required");
  if (s.length > max) throw new MetadataValidationError(field, `At most ${max} characters`);
  return s;
}
function bool(v: unknown, field: string, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "boolean") throw new MetadataValidationError(field, "Must be true or false");
  return v;
}
function list(v: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (v === undefined || v === null || v === "") return [];
  const raw = typeof v === "string" ? v.split(",") : Array.isArray(v) ? v : null;
  if (!raw || raw.some((x) => typeof x !== "string")) throw new MetadataValidationError(field, "Must be a list of text");
  const out = dedupeKeywords(raw as string[]);
  if (out.length > maxItems) throw new MetadataValidationError(field, `At most ${maxItems}`);
  for (const x of out) {
    if (UNSAFE.test(x)) throw new MetadataValidationError(field, "Angle brackets and control characters are not allowed");
    if (x.length > maxLen) throw new MetadataValidationError(field, `Each at most ${maxLen} characters`);
  }
  return out;
}

export interface PostContext {
  site: URL;
  /** allowed /assets/… image paths */
  library: ReadonlySet<string>;
}

function postUrlField(v: unknown, field: string, site: URL, kind: "canonical" | "image", library: ReadonlySet<string>): string {
  const s = text(v, field, 500);
  if (!s) return "";
  if (kind === "image") {
    if (isAllowedImageSrc(s, library)) return s;
    throw new MetadataValidationError(field, "Choose an image from the library or upload one");
  }
  let u: URL;
  try {
    u = new URL(s, site.origin);
  } catch {
    throw new MetadataValidationError(field, "Not a valid URL");
  }
  if (u.protocol !== "https:") throw new MetadataValidationError(field, "Must use https");
  if (u.host !== site.host) throw new MetadataValidationError(field, `Must be on ${site.host}`);
  if (u.search || u.hash) throw new MetadataValidationError(field, "Canonical must not include a query string or #fragment");
  return u.toString();
}

const KNOWN = new Set(["title", "slug", "excerpt", "category", "tags", "author", "coverImage", "coverAlt", "publishDate", "featured", "state", "content", "seo", "createdAt"]);
const SEO_KNOWN = new Set(Object.keys(EMPTY_SEO));

/** Validates a whole post (drafts store the full document). Throws MetadataValidationError (field-specific). */
export function validatePost(input: Record<string, unknown>, ctx: PostContext): BlogPost {
  for (const k of Object.keys(input)) if (!KNOWN.has(k)) throw new MetadataValidationError(k, `Unknown field ${k}`);
  const title = text(input.title, "title", 140, true);
  const rawSlug = text(input.slug, "slug", 80) || slugify(title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(rawSlug)) throw new MetadataValidationError("slug", "Use lowercase letters, numbers and single hyphens (e.g. best-coffee-in-dubai)");
  if (RESERVED_SLUGS.has(rawSlug)) throw new MetadataValidationError("slug", `"${rawSlug}" is reserved — choose another URL`);
  const state = input.state === undefined ? "live" : input.state;
  if (!(POST_STATES as readonly unknown[]).includes(state)) throw new MetadataValidationError("state", `Must be one of: ${POST_STATES.join(", ")}`);

  let publishDate = text(input.publishDate, "publishDate", 40);
  if (publishDate) {
    const d = new Date(publishDate);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) throw new MetadataValidationError("publishDate", "Not a valid date");
    publishDate = d.toISOString();
  }
  const createdAt = text(input.createdAt, "createdAt", 40);
  const coverImage = postUrlField(input.coverImage, "coverImage", ctx.site, "image", ctx.library);
  const coverAlt = text(input.coverAlt, "coverAlt", 250);

  let content: RichNode;
  try {
    content = validateContent(input.content, ctx.library);
  } catch (e) {
    if (e instanceof ContentValidationError) throw new MetadataValidationError("content", e.message);
    throw e;
  }

  const s = (input.seo ?? {}) as Record<string, unknown>;
  if (typeof s !== "object" || Array.isArray(s)) throw new MetadataValidationError("seo", "Invalid SEO settings");
  for (const k of Object.keys(s)) if (!SEO_KNOWN.has(k)) throw new MetadataValidationError(`seo.${k}`, `Unknown field ${k}`);
  const twitterCard = s.twitterCard === undefined || s.twitterCard === "" ? "summary_large_image" : s.twitterCard;
  if (twitterCard !== "summary_large_image" && twitterCard !== "summary") throw new MetadataValidationError("seo.twitterCard", "Must be summary_large_image or summary");
  const seo: PostSeo = {
    title: text(s.title, "seo.title", 120),
    description: text(s.description, "seo.description", 320),
    focusKeyword: text(s.focusKeyword, "seo.focusKeyword", 80),
    secondaryKeywords: list(s.secondaryKeywords, "seo.secondaryKeywords", 15, 80),
    canonical: postUrlField(s.canonical, "seo.canonical", ctx.site, "canonical", ctx.library),
    index: bool(s.index, "seo.index", true),
    follow: bool(s.follow, "seo.follow", true),
    ogTitle: text(s.ogTitle, "seo.ogTitle", 120),
    ogDescription: text(s.ogDescription, "seo.ogDescription", 320),
    ogImage: postUrlField(s.ogImage, "seo.ogImage", ctx.site, "image", ctx.library),
    twitterCard,
  };

  return {
    title,
    slug: rawSlug,
    excerpt: text(input.excerpt, "excerpt", 2000),
    category: text(input.category, "category", 60),
    tags: list(input.tags, "tags", 15, 40),
    author: text(input.author, "author", 80) || "PRESS'D",
    coverImage,
    coverAlt,
    publishDate,
    featured: bool(input.featured, "featured", false),
    state: state as PostState,
    content,
    seo,
    createdAt: createdAt && !Number.isNaN(new Date(createdAt).getTime()) ? new Date(createdAt).toISOString() : new Date().toISOString(),
  };
}

/** Applied when a post is published: a live post without a date gets "now". */
export function finalizeForPublish(p: BlogPost, now = new Date()): BlogPost {
  return p.state === "live" && !p.publishDate ? { ...p, publishDate: now.toISOString() } : p;
}

// ---------------------------------------------------------------- status

export type PostStatus = "draft" | "published" | "scheduled" | "archived";
export const STATUS_LABELS: Record<PostStatus, string> = { draft: "Draft", published: "Published", scheduled: "Scheduled", archived: "Archived" };

/** Public status of the published version (drafts never affect it). */
export function publicStatus(live: BlogPost | null, now = new Date()): PostStatus {
  if (!live) return "draft";
  if (live.state === "archived") return "archived";
  if (live.state !== "live") return "draft";
  return live.publishDate && new Date(live.publishDate) > now ? "scheduled" : "published";
}

/** Visible on /blog right now. */
export const isPublic = (p: BlogPost | null, now = new Date()) => publicStatus(p, now) === "published";
/** Listed in the sitemap: public, index, and canonical pointing at itself. */
export function isIndexable(p: BlogPost, site: URL, now = new Date()): boolean {
  if (!isPublic(p, now) || !p.seo.index) return false;
  return !p.seo.canonical || p.seo.canonical === postUrl(p, site);
}

export const postUrl = (p: Pick<BlogPost, "slug">, site: URL) => new URL(`/blog/${p.slug}`, site.origin).toString();
export const readTime = (p: Pick<BlogPost, "content">) => readingMinutes(contentFacts(p.content).words);

// ---------------------------------------------------------------- change rows (Confirm & Publish, history)

const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v));
const STATE_LABEL: Record<PostState, string> = { live: "Public", unpublished: "Unpublished (hidden)", archived: "Archived (hidden)" };

export function postDiff(before: Partial<BlogPost> | null, after: Partial<BlogPost> | null): { label: string; before: string; after: string }[] {
  const rows: { label: string; before: string; after: string }[] = [];
  const a = before ?? {};
  const b = after ?? {};
  if (!before && after) rows.push({ label: "Article", before: "(not published)", after: `“${b.title ?? ""}” at /blog/${b.slug ?? ""}` });
  if (before && !after) return [{ label: "Article", before: `“${a.title ?? ""}”`, after: "(deleted from the website)" }];
  const fields: [keyof BlogPost, string][] = [
    ["title", "Title"], ["slug", "URL"], ["state", "Visibility"], ["publishDate", "Publication date"], ["excerpt", "Excerpt"], ["category", "Category"],
    ["tags", "Tags"], ["author", "Author"], ["coverImage", "Cover image"], ["coverAlt", "Cover alt text"], ["featured", "Featured"],
  ];
  if (before) {
    for (const [k, label] of fields) {
      if (JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null)) continue;
      const fmt = (v: unknown) => (k === "slug" ? `/blog/${show(v)}` : k === "state" ? STATE_LABEL[v as PostState] ?? show(v) : k === "featured" ? (v ? "Yes" : "No") : show(v));
      rows.push({ label, before: fmt(a[k]), after: fmt(b[k]) });
    }
    if (JSON.stringify(a.content ?? null) !== JSON.stringify(b.content ?? null)) {
      const wa = contentFacts(a.content).words;
      const wb = contentFacts(b.content).words;
      rows.push({ label: "Article body", before: `${wa} words`, after: `${wb} words (edited)` });
    }
    const sa = (a.seo ?? {}) as Partial<PostSeo>;
    const sb = (b.seo ?? {}) as Partial<PostSeo>;
    for (const k of Object.keys(EMPTY_SEO) as (keyof PostSeo)[]) {
      if (JSON.stringify(sa[k] ?? null) !== JSON.stringify(sb[k] ?? null)) rows.push({ label: `SEO · ${k}`, before: show(sa[k]), after: show(sb[k]) });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- SEO analysis (advice only — no ranking claims)

export type AnalysisLevel = "good" | "improve" | "problem";
export interface AnalysisItem {
  id: string;
  level: AnalysisLevel;
  text: string;
}

const has = (hay: string, needle: string) => !!needle && hay.toLocaleLowerCase("en").includes(needle.toLocaleLowerCase("en"));

/**
 * Plain checks of the post as written. They point out common on-page issues;
 * passing them does not mean the article will rank.
 */
export function analyzePost(p: BlogPost, opts: { siteHost: string; titleMin: number; titleMax: number; descriptionMin: number; descriptionMax: number }): AnalysisItem[] {
  const out: AnalysisItem[] = [];
  const add = (id: string, level: AnalysisLevel, t: string) => out.push({ id, level, text: t });
  const f = contentFacts(p.content);
  const seoTitle = p.seo.title || p.title;
  const desc = p.seo.description || p.excerpt;
  const kw = p.seo.focusKeyword;

  // critical metadata
  if (!p.title) add("title", "problem", "Add a title.");
  if (!desc) add("desc", "problem", "Add a meta description (or an excerpt, which is used when the description is empty).");
  else if (desc.length < opts.descriptionMin) add("desc-len", "improve", `Meta description is ${desc.length} characters — aim for about ${opts.descriptionMin}–${opts.descriptionMax}.`);
  else if (desc.length > opts.descriptionMax) add("desc-len", "improve", `Meta description is ${desc.length} characters — Google often shortens text past ~${opts.descriptionMax}.`);
  else add("desc-len", "good", `Meta description length is ${desc.length} characters.`);
  if (seoTitle.length > opts.titleMax) add("title-len", "improve", `SEO title is ${seoTitle.length} characters — it may be cut after ~${opts.titleMax}.`);
  else if (seoTitle && seoTitle.length < opts.titleMin) add("title-len", "improve", `SEO title is only ${seoTitle.length} characters.`);
  else if (seoTitle) add("title-len", "good", `SEO title length is ${seoTitle.length} characters.`);
  if (!p.coverImage) add("cover", "improve", "Add a cover image — it is also the default share image.");
  else if (!p.coverAlt) add("cover-alt", "problem", "Describe the cover image in its alt text.");
  if (!p.seo.index) add("noindex", "improve", "This article is set to noindex: it will not appear in search results or the sitemap.");
  if (p.seo.canonical && p.slug && !p.seo.canonical.endsWith(`/blog/${p.slug}`)) add("canonical", "improve", "The canonical URL points to another page; search engines may index that page instead.");

  // focus keyword
  if (!kw) add("kw", "improve", "Set a focus keyword to check how well the article covers it.");
  else {
    const slugKw = kw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    add("kw-title", has(seoTitle, kw) ? "good" : "improve", has(seoTitle, kw) ? "Focus keyword appears in the SEO title." : "Use the focus keyword in the SEO title.");
    add("kw-slug", slugKw && p.slug.includes(slugKw) ? "good" : "improve", slugKw && p.slug.includes(slugKw) ? "Focus keyword appears in the URL." : "Consider using the focus keyword in the URL slug.");
    add("kw-desc", has(desc, kw) ? "good" : "improve", has(desc, kw) ? "Focus keyword appears in the meta description." : "Use the focus keyword in the meta description.");
    const first = f.paragraphs[0] ?? "";
    add("kw-intro", has(first, kw) ? "good" : "improve", has(first, kw) ? "Focus keyword appears in the first paragraph." : "Mention the focus keyword in the opening paragraph.");
    const count = f.text ? f.text.toLocaleLowerCase("en").split(kw.toLocaleLowerCase("en")).length - 1 : 0;
    add("kw-body", count ? "good" : "problem", count ? `Focus keyword appears ${count} time(s) in the article.` : "The focus keyword does not appear in the article body.");
  }

  // structure
  if (f.words < 300) add("length", "improve", `The article has ${f.words} words. Short posts rarely answer a question fully; 300+ words is a common minimum.`);
  else add("length", "good", `${f.words} words (about ${readingMinutes(f.words)} min read).`);
  if (!f.headings.length && f.words >= 300) add("headings", "improve", "Break the article up with subheadings (H2).");
  else if (f.headings.length) {
    const skips = f.headings.some((h, i) => (i === 0 ? h.level > 2 : h.level > f.headings[i - 1].level + 1));
    add("headings", skips ? "improve" : "good", skips ? "Heading levels skip a step (e.g. H2 → H4). Go down one level at a time, starting at H2." : `${f.headings.length} subheading(s) in order.`);
    if (f.headings.some((h) => !h.text)) add("empty-heading", "problem", "Remove or fill the empty heading.");
  }
  const noAlt = f.images.filter((i) => !i.alt.trim());
  if (noAlt.length) add("img-alt", "problem", `${noAlt.length} image(s) in the article have no alt text.`);
  else if (f.images.length) add("img-alt", "good", "Every image in the article has alt text.");
  const internal = f.links.filter((l) => isInternalHref(l.href, opts.siteHost));
  add("internal-links", internal.length ? "good" : "improve", internal.length ? `${internal.length} internal link(s).` : "Link to another page on the site (the menu, visit page or another article).");
  const external = f.links.length - internal.length;
  if (external) add("external-links", "good", `${external} external link(s).`);

  // readability (indicators only)
  const sentences = f.text.split(/[.!?]+\s/).filter((s) => s.trim().split(" ").length > 2);
  const avg = sentences.length ? Math.round(f.words / sentences.length) : 0;
  if (avg > 25) add("sentences", "improve", `Sentences average ${avg} words — shorter sentences are easier to read on a phone.`);
  else if (avg) add("sentences", "good", `Sentences average ${avg} words.`);
  const longParas = f.paragraphs.filter((x) => x.split(" ").length > 150).length;
  if (longParas) add("paragraphs", "improve", `${longParas} paragraph(s) are over 150 words; split them up.`);
  return out.sort((x, y) => ["problem", "improve", "good"].indexOf(x.level) - ["problem", "improve", "good"].indexOf(y.level));
}

// ---------------------------------------------------------------- public rendering helpers

export interface PublishedPost extends BlogPost {
  id: string;
  /** when the current version was published (dateModified) */
  updatedAt: string;
}

export function absoluteImage(src: string, site: URL): string {
  return new URL(src, site.origin).toString();
}

/** schema.org BlogPosting + BreadcrumbList for an article page. */
export function articleJsonLd(p: PublishedPost, site: URL, publisher: { name: string; logo: string }) {
  const url = postUrl(p, site);
  const image = p.seo.ogImage || p.coverImage;
  const posting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title.slice(0, 110),
    description: p.seo.description || p.excerpt || undefined,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: p.publishDate || p.updatedAt,
    dateModified: p.updatedAt,
    author: { "@type": p.author === publisher.name || p.author === "PRESS'D" ? "Organization" : "Person", name: p.author },
    publisher: { "@type": "Organization", name: publisher.name, logo: { "@type": "ImageObject", url: absoluteImage(publisher.logo, site) } },
    wordCount: contentFacts(p.content).words,
  };
  if (image) posting.image = [absoluteImage(image, site)];
  if (p.category) posting.articleSection = p.category;
  const keywords = [p.seo.focusKeyword, ...p.seo.secondaryKeywords, ...p.tags].filter(Boolean);
  if (keywords.length) posting.keywords = [...new Set(keywords)].join(", ");
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${site.origin}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${site.origin}/blog` },
      { "@type": "ListItem", position: 3, name: p.title, item: url },
    ],
  };
  return [posting, crumbs];
}

/** JSON for <script type="application/ld+json">, with `<` escaped so text can never close the tag. */
export const safeJsonLd = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function categorySlug(c: string) {
  return slugify(c);
}
