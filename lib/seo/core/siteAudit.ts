// Technical SEO audit of the home page, its robots.txt and sitemap, from
// responses actually fetched by the dashboard server. Pure module: the fetching
// lives in services/siteAudit.ts, so every rule is testable without a network.
//
// Every check reports what it saw. Nothing is estimated: checks that need
// Search Console, field performance data or a rendering crawler are listed
// separately as "not checked here".

import { extractPageFacts, extractSitemapLocs, type PageFacts } from "./html.ts";
import type { BusinessInfo } from "./business.ts";

export type CheckStatus = "critical" | "warning" | "suggestion" | "passed";
export type Importance = Exclude<CheckStatus, "passed">;
export const STATUS_ORDER: CheckStatus[] = ["critical", "warning", "suggestion", "passed"];
export const STATUS_LABEL: Record<CheckStatus, string> = { critical: "Critical", warning: "Warning", suggestion: "Suggestion", passed: "Passed" };

export type Area =
  | "status" | "titles" | "descriptions" | "indexability" | "canonical" | "headings" | "images" | "links"
  | "social" | "structured-data" | "business" | "crawling" | "mobile" | "redirects" | "performance";

export const AREA_LABEL: Record<Area, string> = {
  status: "Page status", titles: "Title", descriptions: "Meta description", indexability: "Indexability", canonical: "Canonical URL",
  headings: "Headings", images: "Image alt text", links: "Internal links", social: "Open Graph & X card", "structured-data": "Structured data",
  business: "Business details", crawling: "robots.txt & sitemap", mobile: "Mobile", redirects: "Redirects", performance: "Performance",
};

export interface Check {
  id: string;
  area: Area;
  scope: "page" | "site";
  /** how much this check matters (its weight in the score) */
  importance: Importance;
  status: CheckStatus;
  title: string;
  detail: string;
  fix: string | null;
  /** dashboard screen that fixes it */
  href: string | null;
}

export interface NotChecked {
  area: string;
  reason: string;
  how: string;
}

export interface Fetched {
  url: string;
  status: number | null;
  /** final URL after redirects */
  finalUrl: string;
  redirects: { from: string; to: string; status: number }[];
  body: string | null;
  headers: Record<string, string>;
  ms: number;
  error?: string;
}

export interface HostVariant {
  url: string;
  status: number | null;
  location: string | null;
  error?: string;
}

export interface LinkResult {
  url: string;
  kind: "page" | "image";
  status: number | null;
  error?: string;
}

export interface AuditInput {
  page: Fetched;
  robots: Fetched;
  sitemap: Fetched;
  links: LinkResult[];
  hostVariants: HostVariant[];
  /** canonical origin of the site, e.g. https://www.pressdcafe.ae */
  siteOrigin: string;
  thresholds: { titleMin: number; titleMax: number; descriptionMin: number; descriptionMax: number };
  /** the business details SEO Studio publishes, to compare with the page's structured data */
  business: BusinessInfo | null;
}

export const WEIGHTS: Record<Importance, number> = { critical: 10, warning: 4, suggestion: 1 };

/**
 * Health score: the share of check weight that passed.
 *   score = 100 × (sum of weights of passed checks) ÷ (sum of weights of all checks)
 * Weights: critical 10, warning 4, suggestion 1 — one failed critical check
 * costs as much as ten failed suggestions.
 */
export function healthScore(checks: readonly Pick<Check, "importance" | "status">[]): number | null {
  const total = checks.reduce((n, c) => n + WEIGHTS[c.importance], 0);
  if (!total) return null;
  const passed = checks.reduce((n, c) => n + (c.status === "passed" ? WEIGHTS[c.importance] : 0), 0);
  return Math.round((100 * passed) / total);
}

export function countByStatus(checks: readonly Pick<Check, "status">[]): Record<CheckStatus, number> {
  const out: Record<CheckStatus, number> = { critical: 0, warning: 0, suggestion: 0, passed: 0 };
  for (const c of checks) out[c.status]++;
  return out;
}

export const NOT_CHECKED: NotChecked[] = [
  { area: "Core Web Vitals (LCP, INP, CLS)", reason: "Needs real-user field data or a lab test in a browser.", how: "PageSpeed Insights or Search Console → Core Web Vitals." },
  { area: "Index coverage & manual actions", reason: "Only Google knows which URLs it indexed and why.", how: "Search Console → Pages and Manual actions (not connected to this dashboard)." },
  { area: "Search performance (clicks, impressions, position)", reason: "No Search Console or Analytics connection is configured.", how: "Search Console → Performance." },
  { area: "Rich result eligibility", reason: "Google's own validator decides eligibility.", how: "Rich Results Test (search.google.com/test/rich-results)." },
  { area: "Content rendered by JavaScript", reason: "This audit reads the HTML the server sends, not the page after scripts run.", how: "Search Console → URL Inspection → View crawled page." },
  { area: "Backlinks & external links", reason: "Requires an external crawler or link index.", how: "Search Console → Links." },
];

const EDIT_TAGS = "/admin/seo/pages?path=%2F&tab=seo";

function headerVal(h: Record<string, string>, name: string): string {
  return h[name.toLowerCase()] ?? "";
}

/** Robots rules for user-agent * (or the first group), enough to detect "Disallow: /". */
export function robotsBlocksAll(body: string): boolean {
  let applies = false;
  let inGroupHeader = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      if (!inGroupHeader) applies = false;
      inGroupHeader = true;
      if (val === "*") applies = true;
      continue;
    }
    inGroupHeader = false;
    if (applies && key === "disallow" && val === "/") return true;
  }
  return false;
}

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && (x.pathname.replace(/\/$/, "") || "/") === (y.pathname.replace(/\/$/, "") || "/") && x.search === y.search;
  } catch {
    return false;
  }
}

function findNode(data: unknown, pred: (o: Record<string, unknown>) => boolean, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !data || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const d of data) {
      const r = findNode(d, pred, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const o = data as Record<string, unknown>;
  if (pred(o)) return o;
  if (Array.isArray(o["@graph"])) return findNode(o["@graph"], pred, depth + 1);
  return null;
}

const BUSINESS_TYPES = /LocalBusiness|Restaurant|CafeOrCoffeeShop|FoodEstablishment|Bakery|BarOrPub/;
const digits = (s: unknown) => (typeof s === "string" ? s.replace(/\D/g, "") : "");
const norm = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().toLowerCase() : "");

export function runChecks(input: AuditInput): Check[] {
  const checks: Check[] = [];
  const add = (c: Omit<Check, "status" | "fix" | "href"> & { ok: boolean; fix?: string | null; href?: string | null }) => {
    const { ok, ...rest } = c;
    checks.push({ ...rest, status: ok ? "passed" : c.importance, fix: ok ? null : (c.fix ?? null), href: c.href ?? null });
  };
  const t = input.thresholds;
  const page = input.page;
  const pageOk = page.status === 200 && page.body !== null;

  // ---------- page status ----------
  add({
    id: "page-status", area: "status", scope: "page", importance: "critical", ok: pageOk,
    title: pageOk ? "Page returns 200 OK" : "Page could not be loaded",
    detail: pageOk ? `${page.finalUrl} answered 200 in ${page.ms} ms.` : page.error ? `Request failed: ${page.error}` : `${page.finalUrl} answered ${page.status}.`,
    fix: "Check the deployment and hosting for this URL; nothing else can be audited until it loads.",
  });
  if (page.redirects.length) {
    add({
      id: "page-redirects", area: "redirects", scope: "page", importance: page.redirects.length > 1 ? "warning" : "suggestion", ok: false,
      title: page.redirects.length > 1 ? "Home page goes through a redirect chain" : "Home page URL redirects",
      detail: page.redirects.map((r) => `${r.from} → ${r.status} → ${r.to}`).join(" · "),
      fix: "Link to and declare the final URL directly (canonical, sitemap, profiles) so crawlers skip the redirect.",
    });
  }

  let facts: PageFacts | null = null;
  if (pageOk) facts = extractPageFacts(page.body!);

  if (facts) {
    const f = facts;
    const pageUrl = page.finalUrl;

    // ---------- title ----------
    const title = f.titles[0] ?? "";
    add({ id: "title-present", area: "titles", scope: "page", importance: "critical", ok: !!title, title: title ? "Title tag present" : "Title tag missing", detail: title ? `“${title}”` : "No <title> in the HTML.", fix: "Set the page title under Google & sharing.", href: EDIT_TAGS });
    if (f.titles.length > 1) add({ id: "title-multiple", area: "titles", scope: "page", importance: "warning", ok: false, title: "More than one title tag", detail: `${f.titles.length} <title> tags found.`, fix: "Keep a single <title> (remove the extra one from the page template).", href: EDIT_TAGS });
    if (title) {
      const len = title.length;
      const good = len >= t.titleMin && len <= t.titleMax;
      add({ id: "title-length", area: "titles", scope: "page", importance: "suggestion", ok: good, title: good ? "Title length within guidance" : "Title length outside guidance", detail: `${len} characters (guidance ${t.titleMin}–${t.titleMax}; a guideline, not a Google limit).`, fix: len > t.titleMax ? "Shorten so the key words appear before Google truncates it." : "Add a descriptive phrase (what + where).", href: EDIT_TAGS });
    }

    // ---------- description ----------
    const desc = f.metaDescriptions[0] ?? "";
    add({ id: "desc-present", area: "descriptions", scope: "page", importance: "warning", ok: !!desc, title: desc ? "Meta description present" : "Meta description missing", detail: desc ? `“${desc}”` : "No <meta name=\"description\">.", fix: "Write a meta description under Google & sharing.", href: EDIT_TAGS });
    if (f.metaDescriptions.length > 1) add({ id: "desc-multiple", area: "descriptions", scope: "page", importance: "warning", ok: false, title: "More than one meta description", detail: `${f.metaDescriptions.length} description tags found.`, fix: "Keep a single description tag.", href: EDIT_TAGS });
    if (desc) {
      const len = desc.length;
      const good = len >= t.descriptionMin && len <= t.descriptionMax;
      add({ id: "desc-length", area: "descriptions", scope: "page", importance: "suggestion", ok: good, title: good ? "Description length within guidance" : "Description length outside guidance", detail: `${len} characters (guidance ${t.descriptionMin}–${t.descriptionMax}).`, fix: len > t.descriptionMax ? "Shorten; Google usually cuts long descriptions." : "Expand with what visitors get and where.", href: EDIT_TAGS });
    }
    if (title && desc && title.trim().toLowerCase() === desc.trim().toLowerCase()) add({ id: "title-desc-duplicate", area: "descriptions", scope: "page", importance: "warning", ok: false, title: "Description duplicates the title", detail: "Title and description are identical.", fix: "Write a description that adds information beyond the title.", href: EDIT_TAGS });

    // ---------- indexability ----------
    const robotsDirectives = [...f.metaRobots, headerVal(page.headers, "x-robots-tag").toLowerCase()].join(",");
    const noindex = /\b(noindex|none)\b/.test(robotsDirectives);
    const nofollow = /\b(nofollow|none)\b/.test(robotsDirectives);
    add({ id: "indexable", area: "indexability", scope: "page", importance: "critical", ok: !noindex, title: noindex ? "Page is set to noindex" : "Page can be indexed", detail: noindex ? `Robots directives: ${robotsDirectives.replace(/^,|,$/g, "") || "—"}. Google will drop this page from results.` : `No noindex in meta robots${headerVal(page.headers, "x-robots-tag") ? " or X-Robots-Tag" : ""}.`, fix: "Tick “Show this page in search results” under Google & sharing (and check the hosting's X-Robots-Tag header).", href: EDIT_TAGS });
    if (nofollow) add({ id: "nofollow", area: "indexability", scope: "page", importance: "warning", ok: false, title: "Links on the page are nofollow", detail: "Search engines are asked not to follow links from this page.", fix: "Tick “Let search engines follow links” unless this is intentional.", href: EDIT_TAGS });

    // ---------- canonical ----------
    if (!f.canonicals.length) {
      add({ id: "canonical", area: "canonical", scope: "page", importance: "warning", ok: false, title: "No canonical URL", detail: "No <link rel=\"canonical\">.", fix: `Set the canonical to ${input.siteOrigin}/ under Google & sharing.`, href: EDIT_TAGS });
    } else {
      let cu: URL | null = null;
      try { cu = new URL(f.canonicals[0], pageUrl); } catch { cu = null; }
      const expected = `${input.siteOrigin}/`;
      if (f.canonicals.length > 1) add({ id: "canonical-multiple", area: "canonical", scope: "page", importance: "warning", ok: false, title: "More than one canonical tag", detail: f.canonicals.join(" · "), fix: "Keep exactly one canonical tag; Google may ignore conflicting ones.", href: EDIT_TAGS });
      if (!cu) add({ id: "canonical", area: "canonical", scope: "page", importance: "critical", ok: false, title: "Canonical URL is invalid", detail: f.canonicals[0], fix: "Use a full https URL.", href: EDIT_TAGS });
      else {
        const ok = sameUrl(cu.toString(), expected);
        add({ id: "canonical", area: "canonical", scope: "page", importance: cu.host !== new URL(input.siteOrigin).host ? "critical" : "warning", ok, title: ok ? "Canonical points to the home page" : "Canonical points somewhere else", detail: `Canonical: ${cu.toString()}${ok ? "" : ` (expected ${expected})`}`, fix: "Set the canonical to the page's own preferred URL.", href: EDIT_TAGS });
      }
    }

    // ---------- headings ----------
    add({ id: "h1", area: "headings", scope: "page", importance: "warning", ok: f.h1s.length === 1, title: f.h1s.length === 1 ? "One H1 heading" : f.h1s.length ? "More than one H1" : "No H1 heading", detail: f.h1s.length ? f.h1s.slice(0, 4).map((h) => `“${h || "(empty)"}”`).join(", ") : "The page has no <h1>.", fix: f.h1s.length ? "Use one H1 for the page topic; make the others H2." : "Give the main heading an <h1> (page content editors or code)." , href: "/admin/seo/content/hero" });
    const skips: string[] = [];
    for (let i = 1; i < f.headings.length; i++) if (f.headings[i] > f.headings[i - 1] + 1) skips.push(`H${f.headings[i - 1]} → H${f.headings[i]}`);
    add({ id: "heading-order", area: "headings", scope: "page", importance: "suggestion", ok: !skips.length, title: skips.length ? "Heading levels are skipped" : "Heading levels in order", detail: skips.length ? `${skips.length} skip(s): ${[...new Set(skips)].slice(0, 6).join(", ")}.` : `${f.headings.length} headings, no skipped levels.`, fix: "Step down one level at a time (H2 under H1, H3 under H2). This is a code change in the section components." });

    // ---------- images ----------
    const noAlt = f.images.filter((i) => i.alt === null);
    add({ id: "img-alt", area: "images", scope: "page", importance: "warning", ok: !noAlt.length, title: noAlt.length ? `${noAlt.length} image(s) without an alt attribute` : "Every image has an alt attribute", detail: noAlt.length ? noAlt.slice(0, 8).map((i) => i.src || "(no src)").join(", ") : `${f.images.length} images in the HTML (empty alt = decorative, which is fine).`, fix: "Add alt text under Images & alt text (or alt=\"\" for purely decorative images).", href: "/admin/seo/images" });

    // ---------- mobile ----------
    const vp = f.viewport ?? "";
    add({ id: "viewport", area: "mobile", scope: "page", importance: "critical", ok: /width\s*=\s*device-width/i.test(vp), title: vp ? (/width\s*=\s*device-width/i.test(vp) ? "Mobile viewport set" : "Viewport is not device-width") : "No viewport meta tag", detail: vp ? `content="${vp}"` : "Without it phones render a zoomed-out desktop page.", fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> (Next.js adds it by default)." });
    add({ id: "lang", area: "mobile", scope: "page", importance: "suggestion", ok: !!f.lang, title: f.lang ? `Language declared (${f.lang})` : "No html lang attribute", detail: f.lang ? "Helps search engines and screen readers." : "<html> has no lang attribute.", fix: "Set <html lang=\"en\">." });

    // ---------- social ----------
    const og = f.og;
    const missingOg = ["og:title", "og:description", "og:image"].filter((k) => !og[k]);
    add({ id: "og-basic", area: "social", scope: "page", importance: "warning", ok: !missingOg.length, title: missingOg.length ? `Missing ${missingOg.join(", ")}` : "Open Graph title, description and image present", detail: missingOg.length ? "Shared links fall back to whatever the app guesses." : `og:title “${og["og:title"]}”`, fix: "Fill in the Social sharing fields under Google & sharing.", href: EDIT_TAGS });
    if (og["og:image"]) {
      let abs = false;
      try { abs = new URL(og["og:image"]).protocol === "https:"; } catch { abs = false; }
      add({ id: "og-image-url", area: "social", scope: "page", importance: "warning", ok: abs, title: abs ? "Share image is an absolute https URL" : "Share image URL is not absolute https", detail: og["og:image"], fix: "Use a full https:// URL; most apps ignore relative image paths.", href: EDIT_TAGS });
    }
    add({ id: "og-url", area: "social", scope: "page", importance: "suggestion", ok: !!og["og:url"], title: og["og:url"] ? "og:url present" : "No og:url", detail: og["og:url"] ?? "Apps use the shared URL instead, which can include tracking parameters.", fix: "Set the canonical URL; the site template emits og:url from it." });
    add({ id: "twitter-card", area: "social", scope: "page", importance: "suggestion", ok: !!f.twitter["twitter:card"], title: f.twitter["twitter:card"] ? `X card: ${f.twitter["twitter:card"]}` : "No twitter:card", detail: f.twitter["twitter:card"] ? "X uses Open Graph values for the rest." : "X shows a plain link without it.", fix: "Pick an X (Twitter) card type under Google & sharing.", href: EDIT_TAGS });

    // ---------- structured data ----------
    const invalid = f.jsonLd.filter((j) => !j.ok);
    if (!f.jsonLd.length) add({ id: "jsonld", area: "structured-data", scope: "page", importance: "warning", ok: false, title: "No structured data", detail: "No application/ld+json block.", fix: "Publish Business info; the site emits it as LocalBusiness JSON-LD.", href: "/admin/seo/business" });
    else {
      add({ id: "jsonld", area: "structured-data", scope: "page", importance: "critical", ok: !invalid.length, title: invalid.length ? "Structured data is not valid JSON" : `Structured data parses (${f.jsonLd.flatMap((j) => j.types).join(", ") || "no @type"})`, detail: invalid.length ? invalid.map((j) => j.error).join(" · ") : `${f.jsonLd.length} JSON-LD block(s).`, fix: "Fix the JSON syntax; invalid blocks are ignored by Google.", href: "/admin/seo/business" });
      const incomplete = f.jsonLd.filter((j) => j.ok && (!j.hasContext || !j.types.length));
      if (incomplete.length) add({ id: "jsonld-context", area: "structured-data", scope: "page", importance: "warning", ok: false, title: "Structured data missing @context or @type", detail: `${incomplete.length} block(s).`, fix: "Every block needs \"@context\": \"https://schema.org\" and an @type." });
      const biz = findNode(f.jsonLdData, (o) => BUSINESS_TYPES.test(String(o["@type"] ?? "")));
      if (!biz) add({ id: "jsonld-business", area: "structured-data", scope: "page", importance: "suggestion", ok: false, title: "No LocalBusiness structured data", detail: "None of the JSON-LD types is a local business type.", fix: "Publish Business info.", href: "/admin/seo/business" });
      else {
        const addr = (biz.address ?? {}) as Record<string, unknown>;
        const missing = [["name", biz.name], ["address", addr.streetAddress || addr.addressLocality], ["telephone", biz.telephone], ["openingHours", biz.openingHours ?? biz.openingHoursSpecification], ["geo", biz.geo]].filter(([, v]) => !v).map(([k]) => k as string);
        add({ id: "jsonld-business", area: "structured-data", scope: "page", importance: "warning", ok: !missing.length, title: missing.length ? `Business data missing: ${missing.join(", ")}` : "Business data has name, address, phone, hours and location", detail: `@type ${String(biz["@type"])}`, fix: "Complete the missing fields under Business info.", href: "/admin/seo/business" });

        // ---------- business consistency (page JSON-LD vs Business info) ----------
        if (input.business) {
          const b = input.business;
          const diffs: string[] = [];
          if (b.addressLocality && addr.addressLocality && norm(addr.addressLocality) !== norm(b.addressLocality)) diffs.push(`area “${String(addr.addressLocality)}” vs “${b.addressLocality}”`);
          if (b.streetAddress && addr.streetAddress && norm(addr.streetAddress) !== norm(b.streetAddress)) diffs.push(`street “${String(addr.streetAddress)}” vs “${b.streetAddress}”`);
          if (b.telephone && biz.telephone && digits(biz.telephone) !== digits(b.telephone)) diffs.push(`phone ${String(biz.telephone)} vs ${b.telephone}`);
          const pageHours = Array.isArray(biz.openingHours) ? (biz.openingHours as unknown[]).map(String).join(", ") : typeof biz.openingHours === "string" ? biz.openingHours : "";
          const ourHours = b.openingHours.map((h) => `${h.days} ${h.opens}-${h.closes}`).join(", ");
          if (pageHours && ourHours && norm(pageHours.replace(/\s+/g, " ")) !== norm(ourHours)) diffs.push(`hours “${pageHours}” vs “${ourHours}”`);
          add({ id: "business-consistency", area: "business", scope: "site", importance: "warning", ok: !diffs.length, title: diffs.length ? "Structured data disagrees with Business info" : "Structured data matches Business info", detail: diffs.length ? `Page says ${diffs.join("; ")} (Business info in SEO Studio second).` : "Address, phone and hours match.", fix: "Confirm the correct details (e.g. against the Google Business Profile), then make the website and Business info agree. Don't publish details that haven't been verified.", href: "/admin/seo/business" });
        }
      }
    }

    // ---------- performance (measured from the dashboard server) ----------
    const kb = Math.round((page.body?.length ?? 0) / 1024);
    add({ id: "html-size", area: "performance", scope: "page", importance: "suggestion", ok: kb <= 500, title: `HTML document is ${kb} KB`, detail: "Size of the HTML alone (images, scripts and styles not included).", fix: "Large HTML usually means inlined data; move it to lazily loaded files." });
    add({ id: "response-time", area: "performance", scope: "page", importance: "suggestion", ok: page.ms <= 1500, title: `Server responded in ${page.ms} ms`, detail: "Measured once from the dashboard server — a rough indicator, not Core Web Vitals.", fix: "Check hosting/caching; run PageSpeed Insights for real measurements." });
  }

  // ---------- internal links & images ----------
  if (pageOk) {
    const broken = input.links.filter((l) => l.status === null || l.status >= 400);
    const pages = input.links.filter((l) => l.kind === "page");
    const imgs = input.links.filter((l) => l.kind === "image");
    add({ id: "links-broken", area: "links", scope: "site", importance: "warning", ok: !broken.length, title: broken.length ? `${broken.length} broken internal link(s) or image(s)` : "No broken internal links or images", detail: broken.length ? broken.slice(0, 8).map((l) => `${l.url} (${l.status ?? l.error ?? "failed"})`).join(" · ") : `Checked ${pages.length} link(s) and ${imgs.length} image(s) on this site.`, fix: "Fix or remove the links; replace missing image files (Image library)." , href: broken.some((b) => b.kind === "image") ? "/admin/seo/library" : null });
    const redirected = input.links.filter((l) => l.status !== null && l.status >= 300 && l.status < 400);
    if (redirected.length) add({ id: "links-redirect", area: "links", scope: "site", importance: "suggestion", ok: false, title: `${redirected.length} internal link(s) point to a redirect`, detail: redirected.slice(0, 8).map((l) => `${l.url} (${l.status})`).join(" · "), fix: "Link straight to the final URL." });
  }

  // ---------- robots.txt ----------
  const r = input.robots;
  if (r.status === 200 && r.body !== null) {
    const blocks = robotsBlocksAll(r.body);
    add({ id: "robots-txt", area: "crawling", scope: "site", importance: "critical", ok: !blocks, title: blocks ? "robots.txt blocks the whole site" : "robots.txt allows crawling", detail: blocks ? "“Disallow: /” for all crawlers." : `${r.url} answered 200.`, fix: "Remove “Disallow: /” for User-agent: *." });
    const hasSitemap = /^\s*sitemap\s*:/im.test(r.body);
    add({ id: "robots-sitemap", area: "crawling", scope: "site", importance: "suggestion", ok: hasSitemap, title: hasSitemap ? "robots.txt lists the sitemap" : "robots.txt does not list a sitemap", detail: hasSitemap ? (r.body.match(/^\s*sitemap\s*:\s*(\S+)/im)?.[1] ?? "") : "No Sitemap: line.", fix: `Add “Sitemap: ${input.siteOrigin}/sitemap.xml”.` });
  } else {
    add({ id: "robots-txt", area: "crawling", scope: "site", importance: r.status !== null && r.status >= 500 ? "warning" : "suggestion", ok: false, title: r.status === 404 ? "No robots.txt" : "robots.txt could not be read", detail: r.error ? `Request failed: ${r.error}` : `${r.url} answered ${r.status}.`, fix: r.status !== null && r.status >= 500 ? "A 5xx robots.txt can make Google pause crawling — make it return 200." : "Add a robots.txt that allows crawling and lists the sitemap." });
  }

  // ---------- sitemap ----------
  const s = input.sitemap;
  if (s.status === 200 && s.body) {
    const { locs } = extractSitemapLocs(s.body);
    const home = `${input.siteOrigin}/`;
    const listed = locs.some((l) => sameUrl(l, home));
    add({ id: "sitemap", area: "crawling", scope: "site", importance: "warning", ok: locs.length > 0 && listed, title: !locs.length ? "Sitemap has no URLs" : listed ? `Sitemap lists the home page (${locs.length} URL${locs.length > 1 ? "s" : ""})` : "Sitemap does not list the home page", detail: locs.slice(0, 5).join(" · ") || "No <loc> entries.", fix: "The sitemap should list every indexable page by its canonical URL." });
    const offsite = locs.filter((l) => { try { return new URL(l).origin !== input.siteOrigin; } catch { return true; } });
    if (offsite.length) add({ id: "sitemap-host", area: "crawling", scope: "site", importance: "warning", ok: false, title: "Sitemap lists URLs on another host", detail: offsite.slice(0, 5).join(" · "), fix: `List ${input.siteOrigin} URLs only.` });
  } else {
    add({ id: "sitemap", area: "crawling", scope: "site", importance: "warning", ok: false, title: s.status === 404 ? "No sitemap.xml" : "Sitemap could not be read", detail: s.error ? `Request failed: ${s.error}` : `${s.url} answered ${s.status}.`, fix: "Serve /sitemap.xml listing the home page." });
  }

  // ---------- host variants (http → https, apex ↔ www) ----------
  for (const v of input.hostVariants) {
    let target = "";
    try { target = v.location ? new URL(v.location, v.url).toString() : ""; } catch { target = v.location ?? ""; }
    const ok = v.status !== null && [301, 308].includes(v.status) && target.startsWith(input.siteOrigin);
    const temp = v.status !== null && [302, 303, 307].includes(v.status) && target.startsWith(input.siteOrigin);
    add({
      id: `variant-${v.url}`, area: "redirects", scope: "site", importance: "warning", ok,
      title: ok ? `${v.url} redirects permanently` : temp ? `${v.url} redirects temporarily` : `${v.url} does not redirect to ${input.siteOrigin}`,
      detail: v.error ? `Request failed: ${v.error}` : `${v.status ?? "no response"}${target ? ` → ${target}` : ""}`,
      fix: temp ? "Use a permanent (301/308) redirect so the preferred host is consolidated." : `Redirect every variant to ${input.siteOrigin} with a 301/308 at the host or DNS provider.`,
    });
  }

  return checks.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.area.localeCompare(b.area));
}
