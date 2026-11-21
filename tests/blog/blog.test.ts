// Blog CMS: content sanitising, post validation, status/indexing rules, media
// checks, and the full draft → publish → unpublish → delete flow on MongoDB.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { contentFacts, readingMinutes, safeHref, validateContent, type RichNode } from "../../lib/blog/content.ts";
import { analyzePost, articleJsonLd, blogKey, emptyPost, finalizeForPublish, isIndexable, publicStatus, safeJsonLd, slugify, validatePost, type BlogPost } from "../../lib/blog/post.ts";
import { checkUpload, sniffImage, UploadError } from "../../lib/blog/media.ts";
import { MetadataValidationError } from "../../lib/seo/core/metadata.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import { defaultsFrom } from "../../lib/seo/core/metadata.ts";
import { diffRows, docPermission, isDocKey } from "../../lib/seo/core/docs.ts";
import type { Db } from "../../lib/seo/db/mongo.ts";
import { pendingChanges, publishAll } from "../../lib/seo/services/docs.ts";
import { getDraft, getOverride, saveDraft } from "../../lib/seo/services/metadata.ts";
import { addCategory, assertSlugFree, createPost, deletePost, duplicatePost, getCategories, listPosts, publishPost, removeCategory, setPostState } from "../../lib/blog/service.ts";
import { readImage, storeImage } from "../../lib/blog/mediaStore.ts";
import { replicaSetDb } from "../seo/mongo-helper.ts";

const site = parseSiteUrl("https://www.pressdcafe.ae");
const library = new Set(["/assets/our-cafe-cover.webp", "/assets/menu-cover.webp"]);
const ctx = { site, library };
const metaDefaults = defaultsFrom({ title: "PRESS'D", description: "Default description", alternates: { canonical: "/" } }, site);
const thresholds = { titleMin: 30, titleMax: 60, descriptionMin: 70, descriptionMax: 160 };

const p = (text: string): RichNode => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: RichNode[]): RichNode => ({ type: "doc", content });

describe("article content allow-list", () => {
  test("keeps supported formatting and normalises attributes", () => {
    const d = validateContent(doc(
      { type: "heading", attrs: { level: 2, textAlign: "center", id: "x" }, content: [{ type: "text", text: "Intro" }] },
      { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/#menu", target: "_blank", rel: "x", class: "evil" } as never }] }] },
      { type: "bulletList", content: [{ type: "listItem", content: [p("one")] }] },
      { type: "image", attrs: { src: "/assets/menu-cover.webp", alt: "Menu", title: "Our menu" } },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("A")] }] }] },
    ), library);
    assert.deepEqual(d.content![0], { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [{ type: "text", text: "Intro" }] });
    assert.deepEqual(d.content![1].content![0].marks, [{ type: "bold" }, { type: "link", attrs: { href: "/#menu" } }]);
    assert.equal(d.content![1].attrs, undefined, "default alignment is not stored");
    assert.deepEqual(d.content![3].attrs, { src: "/assets/menu-cover.webp", alt: "Menu", title: "Our menu" });
  });

  test("rejects script-capable or unsupported content", () => {
    assert.throws(() => validateContent(doc({ type: "html", content: [] } as never), library), /not allowed/);
    assert.throws(() => validateContent(doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] }), library), /H2–H6/);
    assert.throws(() => validateContent(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }), library), /not allowed/);
    assert.throws(() => validateContent(doc({ type: "image", attrs: { src: "https://evil.example/x.png", alt: "" } }), library), /image library or an upload/);
    assert.throws(() => validateContent(doc({ type: "image", attrs: { src: "data:image/png;base64,AAA", alt: "" } }), library), /image library/);
    assert.throws(() => validateContent(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "code" as never }] }] }), library), /not supported/);
    assert.throws(() => validateContent(doc({ type: "paragraph", content: [{ type: "table", content: [] }] }), library), /cannot appear inside/);
    assert.throws(() => validateContent({ type: "doc", content: [p("x".repeat(700_000))] }, library), /larger than/);
  });

  test("HTML typed as text stays text (rendered escaped)", () => {
    const d = validateContent(doc(p("<script>alert(1)</script>")), library);
    assert.equal(d.content![0].content![0].text, "<script>alert(1)</script>");
  });

  test("safe links only", () => {
    for (const ok of ["https://example.com/a?b=1", "/blog/x", "#section-2", "mailto:hello@pressdcafe.ae", "tel:+971 55 68 38 426"]) assert.ok(safeHref(ok), ok);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:x", "data:text/html,x", "//evil.example", "vbscript:x", "https://user:pw@x.com", "/a b", "ftp://x"]) assert.equal(safeHref(bad), null, bad);
  });

  test("facts: words, headings, images, links; reading time", () => {
    const f = contentFacts(doc({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hello world" }] }, p("one two three"), { type: "image", attrs: { src: "/assets/menu-cover.webp", alt: "" } }));
    assert.equal(f.words, 5);
    assert.deepEqual(f.headings, [{ level: 2, text: "Hello world" }]);
    assert.equal(f.images.length, 1);
    assert.equal(readingMinutes(0), 1);
    assert.equal(readingMinutes(1000), 5);
  });
});

describe("post validation, status and SEO", () => {
  test("slug is generated from the title and validated", () => {
    assert.equal(slugify("Café Culture: Matcha & More in Dubai’s Summer!"), "cafe-culture-matcha-and-more-in-dubais-summer");
    const v = validatePost({ title: "Best Coffee in Dubai" }, ctx);
    assert.equal(v.slug, "best-coffee-in-dubai");
    assert.equal(v.state, "live");
    assert.throws(() => validatePost({ title: "x", slug: "Bad Slug" }, ctx), /lowercase/);
    assert.throws(() => validatePost({ title: "x", slug: "preview" }, ctx), /reserved/);
    assert.throws(() => validatePost({ slug: "x" }, ctx), (e: unknown) => e instanceof MetadataValidationError && e.field === "title");
    assert.throws(() => validatePost({ title: "x", body: "<p>" }, ctx), /Unknown field body/);
    assert.throws(() => validatePost({ title: "x", seo: { canonical: "https://evil.example/" } }, ctx), /Must be on/);
    assert.throws(() => validatePost({ title: "x", coverImage: "https://evil.example/a.jpg" }, ctx), /library or upload/);
    assert.throws(() => validatePost({ title: "<b>x</b>" }, ctx), /Angle brackets/);
    const tags = validatePost({ title: "x", tags: ["Coffee", "coffee", " Brunch "] }, ctx).tags;
    assert.deepEqual(tags, ["Coffee", "Brunch"]);
  });

  test("status: draft, published, scheduled, archived; indexability", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    const base = validatePost({ title: "A post", publishDate: "2026-11-20T10:00:00Z" }, ctx);
    assert.equal(publicStatus(null, now), "draft");
    assert.equal(publicStatus(base, now), "published");
    assert.equal(publicStatus({ ...base, publishDate: "2026-12-01T00:00:00Z" }, now), "scheduled");
    assert.equal(publicStatus({ ...base, state: "archived" }, now), "archived");
    assert.equal(publicStatus({ ...base, state: "unpublished" }, now), "draft");
    assert.equal(isIndexable(base, site, now), true);
    assert.equal(isIndexable({ ...base, seo: { ...base.seo, index: false } }, site, now), false);
    assert.equal(isIndexable({ ...base, seo: { ...base.seo, canonical: "https://www.pressdcafe.ae/blog/other" } }, site, now), false);
    assert.equal(isIndexable({ ...base, publishDate: "2026-12-01T00:00:00Z" }, site, now), false);
    assert.ok(finalizeForPublish({ ...base, publishDate: "" }, now).publishDate === now.toISOString());
  });

  test("analysis flags missing focus keyword use, alt text and links, without ranking claims", () => {
    const post = validatePost({ title: "Matcha guide", seo: { focusKeyword: "matcha latte" }, content: doc(p("Short text."), { type: "image", attrs: { src: "/assets/menu-cover.webp", alt: "" } }) }, ctx);
    const a = analyzePost(post, { siteHost: site.host, ...thresholds });
    const ids = Object.fromEntries(a.map((x) => [x.id, x.level]));
    assert.equal(ids["kw-title"], "improve");
    assert.equal(ids["kw-body"], "problem");
    assert.equal(ids["img-alt"], "problem");
    assert.equal(ids["internal-links"], "improve");
    assert.ok(!a.some((x) => /rank (#|first|higher)|guarantee/i.test(x.text)));
  });

  test("JSON-LD is BlogPosting + BreadcrumbList and cannot break out of the script tag", () => {
    const post = { ...validatePost({ title: "</script><script>alert(1)</script>".replace(/[<>]/g, ""), publishDate: "2026-11-20T10:00:00Z", coverImage: "/assets/our-cafe-cover.webp" }, ctx), id: "a".repeat(24), updatedAt: "2026-11-21T10:00:00Z" };
    post.title = "</script><script>alert(1)</script>"; // even if a title ever contained it
    const [ld, crumbs] = articleJsonLd(post, site, { name: "PRESS'D Wellness Café", logo: "/assets/pressd-logo.webp" }) as Record<string, unknown>[];
    assert.equal(ld["@type"], "BlogPosting");
    assert.equal(ld.datePublished, "2026-11-20T10:00:00.000Z");
    assert.equal(ld.dateModified, "2026-11-21T10:00:00Z");
    assert.deepEqual(ld.image, ["https://www.pressdcafe.ae/assets/our-cafe-cover.webp"]);
    assert.equal(crumbs["@type"], "BreadcrumbList");
    assert.ok(!safeJsonLd(ld).includes("</script>"));
  });

  test("blog documents join the existing document registry", () => {
    assert.ok(isDocKey(blogKey("a".repeat(24))));
    assert.ok(!isDocKey("@blog:../../etc"));
    assert.equal(docPermission(blogKey("a".repeat(24)) as never, "publish"), "content:publish");
    const rows = diffRows(blogKey("a".repeat(24)) as never, null, validatePost({ title: "New" }, ctx), metaDefaults);
    assert.match(rows[0].after, /\/blog\/new/);
  });
});

describe("uploaded images", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  test("type comes from the bytes; SVG, HTML and fake extensions are refused", () => {
    assert.equal(sniffImage(png(10, 10)), "png");
    assert.deepEqual(checkUpload(png(1600, 1000)), { kind: "png", width: 1600, height: 1000 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00, 0, 0, 0]);
    assert.deepEqual(checkUpload(gif), { kind: "gif", width: 32, height: 16 });
    const enc = new TextEncoder();
    assert.throws(() => checkUpload(enc.encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), UploadError);
    assert.throws(() => checkUpload(enc.encode("<html><script>x</script></html>")), /Only JPEG/);
    assert.throws(() => checkUpload(new Uint8Array()), /empty/);
    assert.throws(() => checkUpload(png(20000, 20000)), /too large/);
    assert.throws(() => checkUpload(new Uint8Array(6 * 1024 * 1024)), /at most 5 MB/);
  });
});

describe("blog lifecycle on MongoDB", () => {
  let db: Db;
  before(async () => {
    db = await replicaSetDb();
  });

  test("create → edit draft → Confirm & Publish → edit published (live unchanged) → unpublish → archive → delete", async () => {
    const { id } = await createPost(db, { title: "Matcha in Dubai", excerpt: "Why we love matcha.", content: doc(p("Matcha is great.")) }, ctx, "ed@test.ae");
    const key = blogKey(id);
    assert.equal(await getOverride(db, key), null, "creating never publishes");
    assert.equal((await listPosts(db))[0].status, "draft");

    // slug clash with another post's draft is refused
    await assert.rejects(createPost(db, { title: "Matcha in Dubai" }, ctx, "ed@test.ae"), /already used/);

    // appears in the shared Confirm & Publish list
    const pending = await pendingChanges(db, metaDefaults, thresholds, site);
    assert.ok(pending.some((x) => x.key === key && /Matcha in Dubai/.test(x.label)));

    // publish everything (the top-bar Confirm & Publish)
    await publishAll(db, "pub@test.ae", metaDefaults, thresholds, site);
    const live1 = (await getOverride(db, key))!.fields as BlogPost;
    assert.ok(live1.publishDate, "publish date set when first published");
    assert.equal((await listPosts(db)).find((r) => r.id === id)!.status, "published");

    // editing a published post: the draft changes, the live version does not
    const d0 = await getDraft(db, key);
    assert.equal(d0, null);
    await saveDraft(db, key, validatePost({ ...live1, title: "Matcha in Dubai — updated" } as never, ctx), "ed@test.ae", null);
    assert.equal(((await getOverride(db, key))!.fields as BlogPost).title, "Matcha in Dubai");
    assert.equal((await listPosts(db)).find((r) => r.id === id)!.pending, true);

    // per-post publish
    await publishPost(db, id, ctx, "pub@test.ae");
    assert.equal(((await getOverride(db, key))!.fields as BlogPost).title, "Matcha in Dubai — updated");
    assert.equal(((await getOverride(db, key))!.fields as BlogPost).publishDate, live1.publishDate, "original date kept");

    await setPostState(db, id, "unpublished", ctx, "pub@test.ae");
    assert.equal((await listPosts(db)).find((r) => r.id === id)!.status, "draft");
    await setPostState(db, id, "archived", ctx, "pub@test.ae");
    assert.equal((await listPosts(db)).find((r) => r.id === id)!.status, "archived");
    await setPostState(db, id, "live", ctx, "pub@test.ae");
    assert.equal((await listPosts(db)).find((r) => r.id === id)!.status, "published");

    // editors cannot delete a published post; publishers can
    await assert.rejects(deletePost(db, id, "ed@test.ae", false), /Only a publisher/);
    await deletePost(db, id, "pub@test.ae", true);
    assert.equal(await getOverride(db, key), null);
    assert.ok(!(await listPosts(db)).some((r) => r.id === id));
    const history = await db.changes.find({ key }).toArray();
    assert.ok(history.length >= 5, "history kept after delete");
  });

  test("duplicate gets a free slug; publishing two posts with the same slug is refused", async () => {
    const { id } = await createPost(db, { title: "Brunch ideas" }, ctx, "ed@test.ae");
    const copy = await duplicatePost(db, id, ctx, "ed@test.ae");
    const copyDraft = (await getDraft(db, blogKey(copy.id)))!.fields as BlogPost;
    assert.equal(copyDraft.slug, "brunch-ideas-copy");
    assert.equal(copyDraft.title, "Copy of Brunch ideas");
    await publishPost(db, id, ctx, "pub@test.ae");
    // a stale draft that grabbed the same slug before it was published is caught at publish time
    await db.drafts.updateOne({ _id: blogKey(copy.id) }, { $set: { "fields.slug": "brunch-ideas" } });
    await assert.rejects(publishPost(db, copy.id, ctx, "pub@test.ae"), /already live/);
    await assert.rejects(assertSlugFree(db, "brunch-ideas", copy.id), /already used/);
  });

  test("categories: add, refuse duplicates, refuse removing one in use", async () => {
    await addCategory(db, "Coffee", "ed@test.ae");
    await assert.rejects(addCategory(db, "coffee", "ed@test.ae"), /already exists/);
    await createPost(db, { title: "Cold brew", category: "Coffee" }, ctx, "ed@test.ae");
    await assert.rejects(removeCategory(db, "Coffee", "pub@test.ae"), /used by/);
    await addCategory(db, "News", "ed@test.ae");
    assert.deepEqual(await removeCategory(db, "News", "pub@test.ae"), ["Coffee"]);
    assert.deepEqual(await getCategories(db), ["Coffee"]);
  });

  test("media: stored in GridFS, deduplicated, served only with the matching extension", async () => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, 800);
    new DataView(b.buffer).setUint32(20, 600);
    const a = await storeImage(db, b, "ed@test.ae");
    const again = await storeImage(db, b, "ed@test.ae");
    assert.equal(a.id, again.id);
    assert.match(a.src, /^\/media\/[0-9a-f]{24}\.png$/);
    const got = await readImage(db, a.id, "png");
    assert.equal(got!.mime, "image/png");
    assert.equal(got!.bytes.length, 33);
    assert.equal(await readImage(db, a.id, "jpg"), null);
    // an uploaded image is accepted in posts
    assert.doesNotThrow(() => validatePost({ title: "With upload", coverImage: a.src, content: doc({ type: "image", attrs: { src: a.src, alt: "x" } }) }, ctx));
  });

  test("emptyPost validates (new-article form)", () => {
    assert.throws(() => validatePost(emptyPost() as never, ctx), /Required/); // title required
    assert.doesNotThrow(() => validatePost({ ...emptyPost(), title: "Hello" } as never, ctx));
  });
});
