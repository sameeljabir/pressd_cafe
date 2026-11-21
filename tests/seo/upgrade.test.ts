// SEO dashboard upgrade: tag fixes, keyword planning, technical audit rules.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { dedupeKeywords, defaultsFrom, parseMetaSnippet, splitKeywordText, stableJson, validateOverride, MetadataValidationError } from "../../lib/seo/core/metadata.ts";
import { diffRows } from "../../lib/seo/core/docs.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import { keywordOverlaps, normalizeKeyword, validateKeywordFields, validateKeywordList } from "../../lib/seo/core/keywords.ts";
import { healthScore, robotsBlocksAll, runChecks, type AuditInput, type Fetched } from "../../lib/seo/core/siteAudit.ts";
import { BUSINESS_DEFAULTS } from "../../lib/seo/core/business.ts";
import type { Db } from "../../lib/seo/db/mongo.ts";
import { pendingChanges, publishAll } from "../../lib/seo/services/docs.ts";
import { getDraft, getOverride, saveDraft } from "../../lib/seo/services/metadata.ts";
import { addKeywords, deleteKeywords, KeywordConflictError, listKeywords, updateKeyword } from "../../lib/seo/services/keywords.ts";
import { internalUrls } from "../../lib/seo/services/siteAudit.ts";
import { openMongo } from "../../lib/seo/db/mongo.ts";
import { replicaSetDb, replicaSetUri } from "./mongo-helper.ts";

const site = parseSiteUrl("https://www.pressdcafe.ae");
const metaDefaults = defaultsFrom({ title: "PRESS'D | Specialty Coffee", description: "Default description", alternates: { canonical: "/" } }, site);
const thresholds = { titleMin: 30, titleMax: 60, descriptionMin: 70, descriptionMax: 160 };

describe("tag fixes", () => {
  test("keywords are de-duplicated case-insensitively and whitespace-normalised", () => {
    assert.deepEqual(dedupeKeywords(["Coffee", " coffee ", "Specialty  coffee", "", "SPECIALTY COFFEE", "Dubai"]), ["Coffee", "Specialty coffee", "Dubai"]);
    const o = validateOverride({ keywords: "Coffee, coffee ,  Brunch Dubai,brunch dubai,,", keywordsEnabled: true }, site);
    assert.equal(o.keywords, "Coffee, Brunch Dubai");
  });

  test("a pasted list splits on commas, semicolons and new lines", () => {
    assert.deepEqual(dedupeKeywords(splitKeywordText("a, b; c\nd\r\ne\tf")), ["a", "b", "c", "d", "e", "f"]);
  });

  test("keyword limits are enforced with a clear message", () => {
    assert.throws(() => validateOverride({ keywords: Array.from({ length: 21 }, (_, i) => `k${i}`).join(",") }, site), MetadataValidationError);
    assert.throws(() => validateOverride({ keywords: "x".repeat(61) }, site), /60 characters/);
    assert.throws(() => validateOverride({ keywords: "<script>" }, site), /Angle brackets/);
  });

  test("pasted <meta> HTML is read into name/content pairs; other tags are ignored", () => {
    const { tags, skipped } = parseMetaSnippet(`
      <meta name="google-site-verification" content="abc123" />
      <META NAME='msvalidate.01' CONTENT='XYZ'>
      <meta property="fb:app_id" content="42">
      <meta name="p:domain_verify" content="a&amp;b">
      <script>alert(1)</script>
      <meta name="no-content">`);
    assert.deepEqual(tags, [
      { name: "google-site-verification", content: "abc123" },
      { name: "msvalidate.01", content: "XYZ" },
      { name: "fb:app_id", content: "42" },
      { name: "p:domain_verify", content: "a&b" },
    ]);
    assert.equal(skipped, 2); // the <script> tag and the <meta> without content (closing tags are not counted)
  });

  test("pasted tags still go through server validation (reserved names rejected)", () => {
    const { tags } = parseMetaSnippet(`<meta property="og:title" content="x">`);
    assert.throws(() => validateOverride({ extraMeta: tags }, site), /managed by the editor/);
  });

  test("REGRESSION: keywords saved with the tag off are a pending change, not invisible", () => {
    const rows = diffRows("/", null, { keywords: "coffee, brunch" }, metaDefaults);
    assert.equal(rows.length, 1);
    assert.match(rows[0].label, /tag off/);
    assert.equal(rows[0].after, "coffee, brunch");
    // turning the tag on is reported as the rendered keywords change
    const on = diffRows("/", { keywords: "coffee, brunch" }, { keywords: "coffee, brunch", keywordsEnabled: true }, metaDefaults);
    assert.deepEqual(on.map((r) => r.label), ["Meta keywords"]);
  });

  test("stableJson ignores key order", () => {
    assert.equal(stableJson({ a: 1, b: { d: 2, c: 3 } }), stableJson({ b: { c: 3, d: 2 }, a: 1 }));
    assert.notEqual(stableJson({ a: 1 }), stableJson({ a: 2 }));
  });
});

describe("tag persistence through draft → publish (local MongoDB)", () => {
  let db: Db;
  before(async () => {
    db = await replicaSetDb();
  });

  test("REGRESSION: a keywords-only draft is listed for publishing and survives publish", async () => {
    const fields = validateOverride({ keywords: "Coffee, coffee, Brunch" }, site);
    await saveDraft(db, "/", fields, "ed@test.ae", null);
    const pending = await pendingChanges(db, metaDefaults, thresholds, site);
    assert.deepEqual(pending.map((p) => p.key), ["/"]);
    await publishAll(db, "pub@test.ae", metaDefaults, thresholds, site);
    assert.equal((await getOverride(db, "/"))!.fields && (await getOverride(db, "/"))!.fields.keywords, "Coffee, Brunch");
    assert.equal(await getDraft(db, "/"), null);
    assert.equal((await pendingChanges(db, metaDefaults, thresholds, site)).length, 0);
  });

  test("extra meta tags are stored, published and returned unchanged", async () => {
    const fields = validateOverride({ extraMeta: parseMetaSnippet(`<meta name="google-site-verification" content="tok_123">`).tags }, site);
    const cur = await getDraft(db, "/");
    await saveDraft(db, "/", fields, "ed@test.ae", cur ? cur.savedAt.toISOString() : null);
    await publishAll(db, "pub@test.ae", metaDefaults, thresholds, site);
    assert.deepEqual((await getOverride(db, "/"))!.fields.extraMeta, [{ name: "google-site-verification", content: "tok_123" }]);
  });
});

describe("keyword planning", () => {
  test("validation: lists, types, targets, unsafe text", () => {
    assert.deepEqual(validateKeywordList("coffee near me; Coffee Near Me\nbrunch"), ["coffee near me", "brunch"]);
    assert.throws(() => validateKeywordList([]), /at least one/);
    assert.throws(() => validateKeywordList(["<b>x</b>"]), /angle brackets/i);
    assert.throws(() => validateKeywordList([42]), /must be text/);
    assert.throws(() => validateKeywordFields({ target: "/admin" }, false), /Must be one of/);
    assert.throws(() => validateKeywordFields({ volume: 100 }, true), /Unknown field/);
    assert.deepEqual(validateKeywordFields({}, false), { type: "secondary", target: "/", group: "", status: "not-started", notes: "" });
    assert.equal(normalizeKeyword("  Specialty   COFFEE "), "specialty coffee");
  });

  test("overlaps: same keyword on several targets; primary conflicts first", () => {
    const o = keywordOverlaps([
      { keyword: "Brunch", normalized: "brunch", target: "/#menu", type: "secondary" },
      { keyword: "brunch", normalized: "brunch", target: "/#visit", type: "secondary" },
      { keyword: "Cafe Dubai", normalized: "cafe dubai", target: "/", type: "primary" },
      { keyword: "cafe dubai", normalized: "cafe dubai", target: "/#about", type: "primary" },
      { keyword: "solo", normalized: "solo", target: "/", type: "primary" },
    ]);
    assert.deepEqual(o.map((x) => [x.normalized, x.primaryConflict]), [["cafe dubai", true], ["brunch", false]]);
  });

  let db: Db;
  before(async () => {
    db = await replicaSetDb();
  });

  test("add → list → update → delete, with duplicates skipped and conflicts refused", async () => {
    const a = await addKeywords(db, { keywords: ["Specialty coffee", "specialty coffee", "Brunch Dubai"], type: "primary", target: "/", group: "Coffee" }, "ed@test.ae");
    assert.deepEqual(a.added.map((k) => k.keyword), ["Specialty coffee", "Brunch Dubai"]);
    assert.deepEqual(a.skipped, []);
    const again = await addKeywords(db, { keywords: "SPECIALTY COFFEE, latte art", target: "/" }, "ed@test.ae");
    assert.deepEqual(again.added.map((k) => k.keyword), ["latte art"]);
    assert.deepEqual(again.skipped, ["SPECIALTY COFFEE"]);
    // the same keyword on another section is allowed (and reported as an overlap)
    await addKeywords(db, { keywords: ["brunch dubai"], target: "/#menu" }, "ed@test.ae");

    const list = await listKeywords(db);
    assert.equal(list.length, 4);
    const kw = list.find((k) => k.keyword === "latte art")!;
    const updated = await updateKeyword(db, kw.id, { status: "in-progress", notes: "Use on the menu page\nwith examples" }, "seo@test.ae", kw.updatedAt);
    assert.equal(updated.status, "in-progress");
    assert.equal(updated.updatedBy, "seo@test.ae");
    // a stale editor cannot overwrite a newer change
    await assert.rejects(updateKeyword(db, kw.id, { status: "optimized" }, "other@test.ae", kw.updatedAt), KeywordConflictError);
    // moving onto a target that already has this keyword is refused
    const brunchHome = list.find((k) => k.normalized === "brunch dubai" && k.target === "/")!;
    await assert.rejects(updateKeyword(db, brunchHome.id, { target: "/#menu" }, "ed@test.ae"), KeywordConflictError);

    await assert.rejects(deleteKeywords(db, []), /at least one/);
    await assert.rejects(deleteKeywords(db, Array.from({ length: 51 }, () => kw.id)), /at most 50/);
    assert.equal(await deleteKeywords(db, [kw.id]), 1);
    assert.equal((await listKeywords(db)).length, 3);
  });

  test("saved keywords are still there from a fresh connection (as after sign-out / reload)", async () => {
    const name = db.db.databaseName;
    const other = await openMongo(await replicaSetUri(name), name);
    try {
      assert.equal((await listKeywords(other)).length, 3);
    } finally {
      await other.client.close();
    }
  });
});

// ---------------------------------------------------------------- audit rules
const ok = (url: string, body: string, headers: Record<string, string> = {}): Fetched => ({ url, status: 200, finalUrl: url, redirects: [], body, headers, ms: 120 });
const notFound = (url: string): Fetched => ({ url, status: 404, finalUrl: url, redirects: [], body: null, headers: {}, ms: 30 });

const GOOD_HTML = `<!doctype html><html lang="en"><head>
<title>PRESS'D | Specialty Coffee &amp; Café at Meydan Polo Residence</title>
<meta name="description" content="PRESS'D is a wellness café at Meydan Polo Residence, Dubai, serving specialty coffee and fresh food in a pet-friendly space.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://www.pressdcafe.ae">
<meta property="og:title" content="PRESS'D"><meta property="og:description" content="Good food"><meta property="og:image" content="https://www.pressdcafe.ae/assets/a.webp"><meta property="og:url" content="https://www.pressdcafe.ae/">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"CafeOrCoffeeShop","name":"PRESS'D","telephone":"+971 55 68 38 426","geo":{"@type":"GeoCoordinates","latitude":25.1},"openingHours":["Mo-Su 07:00-21:00"],"address":{"@type":"PostalAddress","streetAddress":"Meydan Polo Residence, Muscat St","addressLocality":"Nad Al Sheba 1"}}</script>
</head><body><h1>Good food</h1><h2>About</h2><h3>Story</h3><img src="/a.webp" alt="Bowl"><a href="/#about">About</a></body></html>`;

function input(html: string, over: Partial<AuditInput> = {}): AuditInput {
  return {
    page: ok("https://www.pressdcafe.ae/", html),
    robots: ok("https://www.pressdcafe.ae/robots.txt", "User-agent: *\nAllow: /\nSitemap: https://www.pressdcafe.ae/sitemap.xml"),
    sitemap: ok("https://www.pressdcafe.ae/sitemap.xml", `<?xml version="1.0"?><urlset><url><loc>https://www.pressdcafe.ae/</loc></url></urlset>`),
    links: [],
    hostVariants: [{ url: "http://www.pressdcafe.ae/", status: 308, location: "https://www.pressdcafe.ae/" }],
    siteOrigin: "https://www.pressdcafe.ae",
    thresholds,
    business: BUSINESS_DEFAULTS,
    ...over,
  };
}

describe("technical audit rules", () => {
  test("a healthy page passes everything and scores 100", () => {
    const checks = runChecks(input(GOOD_HTML));
    const failing = checks.filter((c) => c.status !== "passed");
    assert.deepEqual(failing.map((c) => `${c.id}: ${c.detail}`), []);
    assert.equal(healthScore(checks), 100);
  });

  test("the static site's JSON-LD (Jumeirah Village Triangle, 23:00) is flagged against Business info", () => {
    const html = GOOD_HTML.replace('"addressLocality":"Nad Al Sheba 1"', '"addressLocality":"Jumeirah Village Triangle"').replace('["Mo-Su 07:00-21:00"]', '["Mo-Th 07:00-23:00","Fr-Su 07:00-00:00"]');
    const c = runChecks(input(html)).find((x) => x.id === "business-consistency")!;
    assert.equal(c.status, "warning");
    assert.match(c.detail, /Jumeirah Village Triangle/);
    assert.match(c.detail, /hours/);
  });

  test("missing essentials are critical/warning with editor links", () => {
    const html = `<html><head><meta name="robots" content="noindex"></head><body><h2>x</h2><h4>y</h4><img src="/x.webp"></body></html>`;
    const checks = runChecks(input(html, { robots: notFound("https://www.pressdcafe.ae/robots.txt"), sitemap: notFound("https://www.pressdcafe.ae/sitemap.xml"), hostVariants: [] }));
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(by["title-present"].status, "critical");
    assert.equal(by["title-present"].href, "/admin/seo/pages?path=%2F&tab=seo");
    assert.equal(by["indexable"].status, "critical");
    assert.equal(by["desc-present"].status, "warning");
    assert.equal(by["canonical"].status, "warning");
    assert.equal(by["img-alt"].status, "warning");
    assert.equal(by["heading-order"].status, "suggestion");
    assert.equal(by["viewport"].status, "critical");
    assert.equal(by["robots-txt"].status, "suggestion");
    assert.equal(by["sitemap"].status, "warning");
    assert.ok(healthScore(checks)! < 40);
  });

  test("X-Robots-Tag noindex, invalid JSON-LD, broken links and temporary redirects are reported", () => {
    const html = GOOD_HTML.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '<script type="application/ld+json">{bad json</script>');
    const checks = runChecks(input(html, {
      page: ok("https://www.pressdcafe.ae/", html, { "x-robots-tag": "noindex" }),
      links: [{ url: "https://www.pressdcafe.ae/old", kind: "page", status: 404 }, { url: "https://www.pressdcafe.ae/a.webp", kind: "image", status: 200 }],
      hostVariants: [{ url: "https://pressdcafe.ae/", status: 302, location: "https://www.pressdcafe.ae/" }],
    }));
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(by["indexable"].status, "critical");
    assert.equal(by["jsonld"].status, "critical");
    assert.equal(by["links-broken"].status, "warning");
    assert.match(by["links-broken"].detail, /\/old \(404\)/);
    assert.match(by["variant-https://pressdcafe.ae/"].title, /temporarily/);
  });

  test("an unreachable page yields only the status and crawl checks", () => {
    const checks = runChecks(input("", { page: { url: "https://www.pressdcafe.ae/", status: null, finalUrl: "https://www.pressdcafe.ae/", redirects: [], body: null, headers: {}, ms: 10000, error: "timed out" } }));
    assert.equal(checks.find((c) => c.id === "page-status")!.status, "critical");
    assert.ok(!checks.some((c) => c.area === "titles"));
  });

  test("robots.txt: Disallow: / for * blocks everything; other groups don't", () => {
    assert.equal(robotsBlocksAll("User-agent: *\nDisallow: /"), true);
    assert.equal(robotsBlocksAll("User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /api/"), false);
    assert.equal(robotsBlocksAll("User-agent: Googlebot\nUser-agent: *\nDisallow: /"), true);
  });

  test("score formula: passed weight ÷ total weight", () => {
    assert.equal(healthScore([]), null);
    assert.equal(healthScore([{ importance: "critical", status: "passed" }, { importance: "critical", status: "critical" }]), 50);
    // one failed critical (10) vs ten passed suggestions (10)
    assert.equal(healthScore([{ importance: "critical", status: "critical" }, ...Array.from({ length: 10 }, () => ({ importance: "suggestion" as const, status: "passed" as const }))]), 50);
  });

  test("internal URLs: same-origin pages and images only, no fragments, admin or api", () => {
    const urls = internalUrls(`<a href="#about">a</a><a href="/menu#x">m</a><a href="/admin/seo">s</a><a href="/api/x">x</a><a href="https://instagram.com/x">i</a><a href="tel:+971">t</a><img src="/assets/a.webp"><img src="/assets/a.webp"><a href="/">home</a>`, "https://www.pressdcafe.ae/");
    assert.deepEqual(urls, [{ url: "https://www.pressdcafe.ae/menu", kind: "page" }, { url: "https://www.pressdcafe.ae/assets/a.webp", kind: "image" }]);
  });
});
