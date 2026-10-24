// SEO dashboard: alt text, business info / JSON-LD, change diffs and Confirm & Publish.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { ALT_MAX, altStatus, altSummary, effectiveAlts, validateAltOverrides } from "../../lib/seo/core/images.ts";
import { BUSINESS_DEFAULTS, buildJsonLd, businessWarnings, effectiveBusiness, jsonLdScript, validateBusiness } from "../../lib/seo/core/business.ts";
import { diffRows, isDocKey, validateDoc } from "../../lib/seo/core/docs.ts";
import { defaultsFrom, MetadataValidationError } from "../../lib/seo/core/metadata.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import { openPglite, type Db } from "../../lib/seo/db/client.ts";
import { NothingToPublishError, pendingChanges, publishAll } from "../../lib/seo/services/docs.ts";
import { getDraft, getOverride, saveDraft } from "../../lib/seo/services/metadata.ts";
import { SITE_IMAGES } from "../../lib/siteImages.ts";

const site = parseSiteUrl("https://www.pressdcafe.ae");
const metaDefaults = defaultsFrom({ title: "PRESS'D | Specialty Coffee", description: "Default description", alternates: { canonical: "/" } }, site);
const thresholds = { titleMin: 30, titleMax: 60, descriptionMin: 70, descriptionMax: 160 };

// The JSON-LD the site rendered before business info became editable.
const ORIGINAL_LD = {
  "@context": "https://schema.org",
  "@type": "CafeOrCoffeeShop",
  name: "PRESS'D Wellness Café",
  address: { "@type": "PostalAddress", addressLocality: "Jumeirah Village Triangle", addressRegion: "Dubai", addressCountry: "AE" },
  servesCuisine: ["Healthy", "Breakfast", "Coffee"],
  openingHours: ["Mo-Th 07:00-23:00", "Fr-Su 07:00-00:00"],
  priceRange: "AED 18-65",
};

describe("alt text", () => {
  const menu = SITE_IMAGES.find((i) => i.key === "hero.rail.menu")!;
  test("status: missing, short, good, decorative", () => {
    assert.equal(altStatus("", false), "missing");
    assert.equal(altStatus("  ", true), "decorative");
    assert.equal(altStatus("Menu", false), "short");
    assert.equal(altStatus("Açaí bowl with fresh berries", false), "good");
  });
  test("defaults are what the site rendered; unknown keys and markup are rejected", () => {
    assert.equal(effectiveAlts(null)[menu.key], menu.alt);
    assert.deepEqual(validateAltOverrides({ [menu.key]: menu.alt }), {}, "default values are not stored");
    assert.deepEqual(validateAltOverrides({ [menu.key]: "  Açaí   bowl  " }), { [menu.key]: "Açaí bowl" });
    assert.throws(() => validateAltOverrides({ "no.such.image": "hello" }), MetadataValidationError);
    assert.throws(() => validateAltOverrides({ [menu.key]: '"><script>alert(1)</script>' }), MetadataValidationError);
    assert.throws(() => validateAltOverrides({ [menu.key]: "a".repeat(ALT_MAX + 1) }), MetadataValidationError);
    assert.throws(() => validateAltOverrides({ [menu.key]: 42 }), MetadataValidationError);
  });
  test("summary counts images that need work", () => {
    const base = altSummary(null);
    assert.equal(base.total, SITE_IMAGES.length);
    const fixed = altSummary(Object.fromEntries(SITE_IMAGES.filter((i) => i.alt !== "").map((i) => [i.key, `A clear description of ${i.label}`])));
    assert.equal(fixed.needsWork, 0);
    assert.equal(altSummary({ [menu.key]: "" }).needsWork, base.needsWork + (altStatus(menu.alt, false) === "good" ? 1 : 0));
  });
});

describe("business info", () => {
  test("defaults render the original JSON-LD byte for byte", () => {
    assert.equal(JSON.stringify(buildJsonLd(null)), JSON.stringify(ORIGINAL_LD));
    assert.deepEqual(validateBusiness({ ...BUSINESS_DEFAULTS }), {});
  });
  test("only changed fields are stored, and re-validating a stored draft keeps it unchanged", () => {
    const stored = validateBusiness({ ...BUSINESS_DEFAULTS, telephone: "+971 4 000 0000", streetAddress: "Meydan Polo Residence" });
    assert.deepEqual(stored, { telephone: "+971 4 000 0000", streetAddress: "Meydan Polo Residence" });
    assert.deepEqual(validateBusiness(stored as Record<string, unknown>), stored, "partial input keeps the other defaults");
    const ld = buildJsonLd(stored);
    assert.deepEqual((ld.address as Record<string, unknown>).addressLocality, "Jumeirah Village Triangle");
    assert.equal(ld.priceRange, "AED 18-65");
    assert.equal(ld.telephone, "+971 4 000 0000");
  });
  test("empty string clears a default field", () => {
    const stored = validateBusiness({ priceRange: "" });
    assert.deepEqual(stored, { priceRange: "" });
    assert.equal("priceRange" in buildJsonLd(stored), false);
  });
  test("rejects bad values", () => {
    for (const bad of [
      { url: "http://pressdcafe.ae" }, { url: "not a url" }, { telephone: "call us!" }, { email: "nope" }, { addressCountry: "UAE" },
      { latitude: "95" }, { latitude: "25.1" }, { name: "" }, { foo: "bar" }, { servesCuisine: "Coffee" },
      { openingHours: [{ days: "Funday", opens: "07:00", closes: "23:00" }] }, { openingHours: [{ days: "Mo-Fr", opens: "7am", closes: "23:00" }] },
    ]) assert.throws(() => validateBusiness(bad as Record<string, unknown>), MetadataValidationError, JSON.stringify(bad));
  });
  test("geo is emitted only with both coordinates; JSON-LD script cannot close its tag", () => {
    assert.deepEqual(buildJsonLd({ latitude: "25.16", longitude: "55.3" }).geo, { "@type": "GeoCoordinates", latitude: 25.16, longitude: 55.3 });
    const script = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    assert.ok(!script.includes("<"), script);
    assert.equal(JSON.parse(script).name, "</script><script>alert(1)</script>");
  });
  test("warns about the Meydan / JVT mismatch", () => {
    const w = businessWarnings(effectiveBusiness(null), "PRESS'D at Meydan Polo Residence");
    assert.ok(w.some((x) => /Meydan Polo Residence/.test(x)));
    assert.ok(!businessWarnings(effectiveBusiness({ streetAddress: "Meydan Polo Residence" }), "Meydan").some((x) => /Confirm which/.test(x)));
  });
});

describe("documents", () => {
  test("keys and per-document validation", () => {
    assert.ok(isDocKey("/") && isDocKey("@images") && isDocKey("@business"));
    assert.ok(!isDocKey("/admin") && !isDocKey("@other") && !isDocKey(1));
    assert.throws(() => validateDoc("@images", { x: "y" }, site), MetadataValidationError);
  });
  test("diff rows describe visible changes only", () => {
    assert.deepEqual(diffRows("@business", null, { telephone: "+971 4 000 0000" }, metaDefaults), [{ label: "Phone", before: "—", after: "+971 4 000 0000" }]);
    assert.equal(diffRows("@images", null, {}, metaDefaults).length, 0);
    assert.match(diffRows("@images", null, { "hero.rail.menu": "Açaí bowl with berries" }, metaDefaults)[0].label, /^Alt — /);
    assert.deepEqual(diffRows("/", null, { title: "New title for the home page" }, metaDefaults).map((r) => r.label), ["Title"]);
  });
});

describe("Confirm & Publish", () => {
  let db: Db;
  before(async () => {
    db = await openPglite(null);
  });
  test("nothing saved → nothing to publish", async () => {
    assert.deepEqual(await pendingChanges(db, metaDefaults, thresholds, site), []);
    await assert.rejects(publishAll(db, "pub@test.ae", metaDefaults, thresholds, site), NothingToPublishError);
  });
  test("publishes every saved draft and clears them", async () => {
    await saveDraft(db, "/", { title: "PRESS'D | Wellness Café in Dubai, all day" }, "ed@test.ae");
    await saveDraft(db, "@images", { "hero.rail.menu": "Açaí bowl with fresh berries" } as never, "ed@test.ae");
    await saveDraft(db, "@business", { telephone: "+971 4 000 0000" } as never, "ed@test.ae");
    const pending = await pendingChanges(db, metaDefaults, thresholds, site);
    assert.deepEqual(pending.map((p) => p.key), ["/", "@images", "@business"]);
    const changes = await publishAll(db, "pub@test.ae", metaDefaults, thresholds, site);
    assert.equal(changes.length, 3);
    for (const k of ["/", "@images", "@business"]) assert.equal(await getDraft(db, k), null, `draft ${k} cleared`);
    assert.deepEqual((await getOverride(db, "@business"))?.fields, { telephone: "+971 4 000 0000" });
    assert.deepEqual(await pendingChanges(db, metaDefaults, thresholds, site), []);
  });
  test("one invalid draft blocks the whole publish", async () => {
    await saveDraft(db, "/", { title: "Another valid title for the home page" }, "ed@test.ae");
    await saveDraft(db, "@images", { "hero.rail.menu": "<b>bold</b>" } as never, "ed@test.ae");
    const before = await getOverride(db, "/");
    await assert.rejects(publishAll(db, "pub@test.ae", metaDefaults, thresholds, site), MetadataValidationError);
    assert.equal((await getOverride(db, "/"))?.version, before?.version, "valid draft was not published either");
    assert.ok(await getDraft(db, "/"), "drafts are kept");
  });
  test("a draft equal to what is live is not pending", async () => {
    await saveDraft(db, "@images", { "hero.rail.menu": "Açaí bowl with fresh berries" } as never, "ed@test.ae");
    assert.ok(!(await pendingChanges(db, metaDefaults, thresholds, site)).some((p) => p.key === "@images"));
  });
});
