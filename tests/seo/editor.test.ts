// SEO tag editor: sign-in, field validation and security, rendering, drafts/publishing.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, isPasswordHash } from "../../lib/seo/core/password.ts";
import { parseAllowlist } from "../../lib/seo/core/permissions.ts";
import {
  validateOverride, applyOverride, effectiveMeta, defaultsFrom, compareEffective, overrideWarnings, MetadataValidationError,
  type RenderedMeta,
} from "../../lib/seo/core/metadata.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import { openPglite, type Db } from "../../lib/seo/db/client.ts";
import { adminLog } from "../../lib/seo/db/schema.ts";
import { attemptLogin, MAX_FAILS_PER_EMAIL } from "../../lib/seo/services/login.ts";
import { getDraft, getOverride, publishOverride, saveDraft } from "../../lib/seo/services/metadata.ts";
import { readOverrideResilient, MetadataUnavailableError } from "../../lib/seo/public.ts";

const site = parseSiteUrl("https://www.pressdcafe.ae");
const siteMeta = {
  title: "PRESS'D | Specialty Coffee",
  description: "Default description",
  alternates: { canonical: "/" },
  openGraph: { title: "OG default", description: "OG desc", type: "website", images: [{ url: "/assets/our-cafe-cover.webp", width: 1536, height: 1024 }] },
};
const defaults = defaultsFrom(siteMeta, site);

describe("passwords", () => {
  test("hash round-trip; wrong password and malformed hashes fail", async () => {
    const h = await hashPassword("correct horse battery staple");
    assert.ok(isPasswordHash(h));
    assert.ok(!h.includes("$"), "no $ — survives .env variable expansion");
    assert.equal(await verifyPassword("correct horse battery staple", h), true);
    assert.equal(await verifyPassword("correct horse battery stapl", h), false);
    assert.equal(await verifyPassword("anything", null), false);
    assert.equal(await verifyPassword("anything", "plaintext-password"), false);
    await assert.rejects(hashPassword("short"));
  });
  test("SEO_ADMIN_USERS carries email, role and hash", async () => {
    const h = await hashPassword("a long enough password");
    const { users, hashes, errors } = parseAllowlist(`Owner@PressdCafe.ae:admin:${h}, seo@x.com:publisher, bad@x.com:editor:not-a-hash`);
    assert.equal(users.get("owner@pressdcafe.ae"), "admin");
    assert.equal(hashes.get("owner@pressdcafe.ae"), h);
    assert.equal(users.get("seo@x.com"), "publisher");
    assert.equal(hashes.has("seo@x.com"), false); // listed but cannot sign in
    assert.equal(errors.length, 1);
  });
});

describe("sign-in with lockout (PGlite)", () => {
  let db: Db;
  let allow: ReturnType<typeof parseAllowlist>;
  before(async () => {
    db = await openPglite(null);
    allow = parseAllowlist(`pub@test.ae:publisher:${await hashPassword("publisher password 1")}`);
  });
  test("correct password signs in with the configured role", async () => {
    assert.deepEqual(await attemptLogin(db, { email: " PUB@test.ae ", password: "publisher password 1", ip: "1.1.1.1" }, allow), { ok: true, email: "pub@test.ae", role: "publisher" });
  });
  test("wrong password and unknown users get the same generic failure", async () => {
    assert.deepEqual(await attemptLogin(db, { email: "pub@test.ae", password: "nope", ip: "1.1.1.1" }, allow), { ok: false, reason: "invalid" });
    assert.deepEqual(await attemptLogin(db, { email: "ghost@test.ae", password: "nope", ip: "1.1.1.1" }, allow), { ok: false, reason: "invalid" });
  });
  test(`after ${MAX_FAILS_PER_EMAIL} failures the account is locked, even with the right password`, async () => {
    for (let i = 0; i < MAX_FAILS_PER_EMAIL; i++) await attemptLogin(db, { email: "pub@test.ae", password: `bad ${i}`, ip: `2.2.2.${i}` }, allow);
    assert.deepEqual(await attemptLogin(db, { email: "pub@test.ae", password: "publisher password 1", ip: "3.3.3.3" }, allow), { ok: false, reason: "locked" });
    const later = new Date(Date.now() + 16 * 60_000);
    assert.equal((await attemptLogin(db, { email: "pub@test.ae", password: "publisher password 1", ip: "3.3.3.3" }, allow, later)).ok, true, "lock expires");
  });
  test("passwords are never written to the log", async () => {
    const rows = await db.select().from(adminLog);
    assert.ok(rows.length > 0);
    assert.ok(!JSON.stringify(rows).includes("password 1") && !JSON.stringify(rows).includes("bad 0"));
  });
});

describe("field validation", () => {
  const bad = (input: Record<string, unknown>, field?: string) =>
    assert.throws(() => validateOverride(input, site), (e) => e instanceof MetadataValidationError && (!field || e.field.startsWith(field)));
  test("keywords: normalised, only rendered when enabled, required when enabled", () => {
    assert.deepEqual(validateOverride({ keywords: " coffee,  dubai cafe ,coffee ", keywordsEnabled: true }, site), { keywords: "coffee, dubai cafe", keywordsEnabled: true });
    assert.deepEqual(validateOverride({ keywords: "coffee", keywordsEnabled: false }, site), { keywords: "coffee" });
    bad({ keywordsEnabled: true }, "keywords");
    bad({ keywords: Array.from({ length: 21 }, (_, i) => `k${i}`).join(",") }, "keywords");
  });
  test("canonical: same host, https, no query; apex gets a hint", () => {
    assert.equal(validateOverride({ canonical: "/" }, site).canonical, "https://www.pressdcafe.ae/");
    assert.throws(() => validateOverride({ canonical: "https://pressdcafe.ae/" }, site), /use www\.pressdcafe\.ae/);
    bad({ canonical: "https://evil.example/" }, "canonical");
    bad({ canonical: "http://www.pressdcafe.ae/" }, "canonical");
    bad({ canonical: "https://www.pressdcafe.ae/?utm=1" }, "canonical");
    bad({ canonical: "javascript:alert(1)" }, "canonical");
  });
  test("share image: site image files only", () => {
    assert.equal(validateOverride({ ogImage: "/assets/menu-cover.webp" }, site).ogImage, "https://www.pressdcafe.ae/assets/menu-cover.webp");
    bad({ ogImage: "/assets/menu.svg" }, "ogImage");
    bad({ ogImage: "data:image/png;base64,AAAA" }, "ogImage");
    bad({ ogImage: "https://cdn.evil.example/x.png" }, "ogImage");
  });
  test("robots, og:type and X card are restricted to known values; default robots not stored", () => {
    assert.deepEqual(validateOverride({ robots: "index, follow" }, site), {});
    assert.deepEqual(validateOverride({ robots: "noindex, nofollow", ogType: "article", twitterCard: "summary" }, site), { robots: "noindex, nofollow", ogType: "article", twitterCard: "summary" });
    bad({ robots: "noarchive" }, "robots");
    bad({ ogType: "restaurant" }, "ogType");
    bad({ twitterCard: "player" }, "twitterCard");
  });
  test("text fields reject markup and control characters", () => {
    bad({ title: "<script>alert(1)</script>" }, "title");
    bad({ description: 'x" onload="alert(1)' + "<" }, "description");
    bad({ ogTitle: "a\u0000b" }, "ogTitle");
  });
  test("additional tags: valid ones pass", () => {
    assert.deepEqual(validateOverride({ extraMeta: [{ name: "google-site-verification", content: "abc123" }, { name: "author", content: "PRESS'D" }] }, site).extraMeta, [
      { name: "google-site-verification", content: "abc123" },
      { name: "author", content: "PRESS'D" },
    ]);
  });
  test("additional tags: unsafe, conflicting or duplicate tags are rejected", () => {
    for (const name of ["robots", "Description", "keywords", "viewport", "og:title", "twitter:card", "fb:app_id", "googlebot"]) bad({ extraMeta: [{ name, content: "x" }] }, "extraMeta");
    for (const name of ["http-equiv", "x onload", "<script>", "1abc", "a\"b", ""]) bad({ extraMeta: [{ name, content: "x" }] }, "extraMeta");
    bad({ extraMeta: [{ name: "author", content: "<script>alert(1)</script>" }] }, "extraMeta");
    bad({ extraMeta: [{ name: "author", content: "a" }, { name: "AUTHOR", content: "b" }] }, "extraMeta");
    bad({ extraMeta: [{ name: "author", content: "a", property: "og:x" }] }, "extraMeta");
    bad({ extraMeta: Array.from({ length: 21 }, (_, i) => ({ name: `t${i}`, content: "x" })) }, "extraMeta");
    bad({ extraMeta: "author=x" }, "extraMeta");
  });
});

describe("rendering and verification values", () => {
  test("no override → base returned unchanged (public output identical)", () => {
    assert.equal(applyOverride(siteMeta, null), siteMeta);
    assert.equal(applyOverride(siteMeta, {}), siteMeta);
  });
  test("keywords only when enabled; social changes also set X tags; extra tags via `other`", () => {
    const off = applyOverride(siteMeta, { keywords: "coffee" }) as Record<string, unknown>;
    assert.equal(off.keywords, undefined);
    const m = applyOverride(siteMeta, { keywords: "coffee, dubai", keywordsEnabled: true, ogTitle: "New OG", twitterCard: "summary", extraMeta: [{ name: "google-site-verification", content: "abc" }] }) as Record<string, unknown>;
    assert.deepEqual(m.keywords, ["coffee", "dubai"]);
    assert.equal((m.openGraph as Record<string, unknown>).title, "New OG");
    assert.equal((m.openGraph as Record<string, unknown>).description, "OG desc", "other OG fields kept");
    assert.deepEqual(m.twitter, { card: "summary", title: "New OG", description: "OG desc", images: ["/assets/our-cafe-cover.webp"] });
    assert.deepEqual(m.other, { "google-site-verification": "abc" });
  });
  test("defaults and effective values", () => {
    assert.equal(defaults.canonical, "https://www.pressdcafe.ae/");
    assert.equal(defaults.ogImage, "https://www.pressdcafe.ae/assets/our-cafe-cover.webp");
    assert.equal(defaults.twitterCard, "summary_large_image");
    const e = effectiveMeta(defaults, { title: "T", robots: "noindex, follow", keywords: "a", keywordsEnabled: true });
    assert.equal(e.title, "T");
    assert.equal(e.description, "Default description");
    assert.equal(e.robots, "noindex, follow");
    assert.equal(e.keywords, "a");
  });
  test("verification compares rendered tags (root canonical without slash still matches)", () => {
    const expected = effectiveMeta(defaults, { title: "T" });
    const rendered: RenderedMeta = { title: "T", description: "Default description", keywords: null, canonical: "https://www.pressdcafe.ae", robots: null, ogTitle: "OG default", ogDescription: "OG desc", ogImage: "https://www.pressdcafe.ae/assets/our-cafe-cover.webp", ogType: "website", twitterCard: "summary_large_image", other: {} };
    assert.deepEqual(compareEffective(expected, rendered), []);
    assert.equal(compareEffective(expected, { ...rendered, title: "Old" }).length, 1);
    assert.deepEqual(compareEffective(effectiveMeta(defaults, { title: "T", robots: "noindex, follow" }), rendered), ['robots is "(none — index, follow)"']);
    assert.deepEqual(compareEffective(effectiveMeta(defaults, { title: "T", extraMeta: [{ name: "x-a", content: "1" }] }), rendered), ['meta "x-a" is "(missing)"']);
  });
  test("warnings: canonical to another path, noindex, keywords, length", () => {
    const t = { titleMin: 30, titleMax: 60, descriptionMin: 70, descriptionMax: 160 };
    const o = validateOverride({ canonical: "/menu", robots: "noindex, follow", keywords: "a", keywordsEnabled: true, title: "x".repeat(80) }, site);
    const w = overrideWarnings(o, effectiveMeta(defaults, o), t, site, "/").join(" | ");
    assert.match(w, /Canonical points to \/menu/);
    assert.match(w, /noindex/);
    assert.match(w, /keywords tag will be rendered/);
    assert.match(w, /Title is 80 characters/);
  });
});

describe("published metadata survives database problems", () => {
  const ok = async () => ({ title: "Published" });
  const failing = async (): Promise<null> => { throw new Error("connection refused"); };
  const slow = () => new Promise<null>((r) => setTimeout(() => r(null), 500));
  test("success returns the published values", async () => {
    assert.deepEqual(await readOverrideResilient(ok, { isBuild: false }), { title: "Published" });
  });
  test("at runtime a failure throws, so Next keeps serving the last generated page", async () => {
    await assert.rejects(readOverrideResilient(failing, { isBuild: false }), MetadataUnavailableError);
    await assert.rejects(readOverrideResilient(slow, { isBuild: false, timeoutMs: 50 }), MetadataUnavailableError);
  });
  test("during the build a failure falls back to code defaults (the build is not blocked)", async () => {
    assert.equal(await readOverrideResilient(failing, { isBuild: true }), null);
  });
});

describe("drafts and publishing (PGlite)", () => {
  let db: Db;
  before(async () => {
    db = await openPglite(null);
  });
  test("saving a draft does not change what is published", async () => {
    await publishOverride(db, "/", { title: "Live v1" }, "pub@test.ae");
    await saveDraft(db, "/", { title: "Draft title" }, "ed@test.ae");
    assert.equal((await getOverride(db, "/"))!.fields.title, "Live v1");
    assert.equal((await getDraft(db, "/"))!.fields.title, "Draft title");
  });
  test("publishing replaces the live values and clears the draft", async () => {
    const change = await publishOverride(db, "/", { title: "Live v2" }, "pub@test.ae");
    assert.equal(change.version, 2);
    assert.deepEqual(change.before, { title: "Live v1" });
    assert.equal((await getOverride(db, "/"))!.fields.title, "Live v2");
    assert.equal(await getDraft(db, "/"), null);
  });
  test("a failed publish leaves the previous published values in place", async () => {
    const broken = new Proxy(db, {
      get(target, prop, recv) {
        if (prop === "insert" || prop === "update" || prop === "delete") return () => { throw new Error("database write failed"); };
        return Reflect.get(target, prop, recv);
      },
    }) as Db;
    await assert.rejects(publishOverride(broken, "/", { title: "Should not go live" }, "pub@test.ae"), /database write failed/);
    assert.equal((await getOverride(db, "/"))!.fields.title, "Live v2");
  });
});
