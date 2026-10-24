// SEO dashboard: alt text, business info / JSON-LD, change diffs and Confirm & Publish.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { ALT_MAX, altStatus, altSummary, effectiveAlts, validateAltOverrides } from "../../lib/seo/core/images.ts";
import { BUSINESS_DEFAULTS, buildJsonLd, businessWarnings, effectiveBusiness, jsonLdScript, validateBusiness } from "../../lib/seo/core/business.ts";
import { diffRows, isDocKey, validateDoc } from "../../lib/seo/core/docs.ts";
import { defaultsFrom, MetadataValidationError } from "../../lib/seo/core/metadata.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import { DatabaseUnavailableError, getDb, mongoUriProblem, openMongo, type Db } from "../../lib/seo/db/mongo.ts";
import { lastPublished, NothingToPublishError, pendingChanges, publishAll } from "../../lib/seo/services/docs.ts";
import { changeHistory, ConcurrentPublishError, getChange, getDraft, getOverride, publishOverride, saveDraft } from "../../lib/seo/services/metadata.ts";
import { replicaSetDb, replicaSetUri, standaloneDb } from "./mongo-helper.ts";
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

for (const [mode, open] of [["replica set, transactions", replicaSetDb], ["standalone, no transactions", standaloneDb]] as const) {
describe(`Confirm & Publish (local MongoDB, ${mode})`, () => {
  let db: Db;
  before(async () => {
    db = await open();
    assert.equal(db.transactions, mode.startsWith("replica"));
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
}

describe("MongoDB connection handling", () => {
  const PLACEHOLDER = "mongodb+srv://<db_username>:<db_password>@cluster0.y8avod9.mongodb.net/pressd_seo?retryWrites=true&w=majority";
  test("connection string checks never echo the value", () => {
    assert.equal(mongoUriProblem(undefined), "not set");
    assert.equal(mongoUriProblem("  "), "not set");
    assert.match(mongoUriProblem(PLACEHOLDER)!, /placeholders/);
    assert.match(mongoUriProblem("postgres://u:secretpw@host/db")!, /must start with/);
    assert.equal(mongoUriProblem("mongodb+srv://user:secretpw@cluster0.example.net/pressd_seo"), null);
    for (const u of [PLACEHOLDER, "postgres://u:secretpw@host/db"]) assert.ok(!mongoUriProblem(u)!.includes("secretpw") && !mongoUriProblem(u)!.includes("cluster0"));
  });
  test("production without a usable MONGODB_URI fails closed (no in-memory fallback)", async () => {
    const env = { ...process.env };
    const g = globalThis as { __seoMongo?: unknown };
    try {
      for (const uri of [undefined, PLACEHOLDER]) {
        delete g.__seoMongo;
        (process.env as Record<string, string>).NODE_ENV = "production";
        if (uri) process.env.MONGODB_URI = uri;
        else delete process.env.MONGODB_URI;
        await assert.rejects(getDb(), (e: Error) => e instanceof DatabaseUnavailableError && !e.message.includes("cluster0"));
      }
    } finally {
      delete g.__seoMongo;
      process.env = env;
    }
  });
  test("the database name comes from the connection string", async () => {
    const db = await openMongo(await replicaSetUri("pressd_seo_named"));
    assert.equal(db.db.databaseName, "pressd_seo_named");
    const names = (await db.changes.listIndexes().toArray()).map((i) => i.name);
    assert.ok(names.includes("key_version_unique"));
    await db.client.close();
  });
});

describe("publishing safety (local MongoDB)", () => {
  test("two simultaneous publishes of one document: exactly one wins, history stays consistent", async () => {
    for (const open of [replicaSetDb, standaloneDb]) {
      const db = await open();
      await publishOverride(db, "/", { title: "Base title for the home page" }, "a@test.ae");
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) => publishOverride(db, "/", { title: `Racing title number ${i}` }, `p${i}@test.ae`)),
      );
      const won = results.filter((r) => r.status === "fulfilled");
      assert.ok(won.length >= 1);
      for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof ConcurrentPublishError, String(r.reason));
      const live = (await getOverride(db, "/"))!;
      const hist = await changeHistory(db, "/");
      assert.equal(hist.length, live.version, "one applied history entry per published version");
      assert.deepEqual(hist[0].after, live.fields, "newest history entry is what is live");
      assert.deepEqual(new Set(hist.map((h) => h.version)).size, hist.length);
    }
  });
  test("an interrupted publish without transactions is hidden and skipped", async () => {
    const db = await standaloneDb();
    await publishOverride(db, "@business", { telephone: "+971 4 111 1111" }, "a@test.ae");
    const { ObjectId } = await import("mongodb");
    await db.changes.insertOne({ _id: new ObjectId(), key: "@business", actor: "crashed@test.ae", action: "publish", before: {}, after: { telephone: "+971 4 999 9999" }, version: 2, at: new Date(), verified: null, verificationNote: null, applied: false });
    assert.equal((await changeHistory(db, "@business")).length, 1, "unapplied entry not shown");
    const c = await publishOverride(db, "@business", { telephone: "+971 4 222 2222" }, "b@test.ae");
    assert.equal(c.version, 3);
    assert.deepEqual((await getOverride(db, "@business"))!.fields, { telephone: "+971 4 222 2222" });
    assert.equal(await getChange(db, "not-an-id"), null);
  });
  test("with transactions, a failure part-way publishes nothing and keeps every draft", async () => {
    const db = await replicaSetDb();
    await saveDraft(db, "/", { title: "Valid new title for the home page" }, "ed@test.ae");
    await saveDraft(db, "@business", { telephone: "+971 4 000 0000" }, "ed@test.ae");
    let calls = 0;
    const broken: Db = {
      ...db,
      overrides: new Proxy(db.overrides, {
        get: (t, p, r) => (p === "insertOne" ? (...a: unknown[]) => (++calls === 2 ? Promise.reject(new Error("disk full")) : (t.insertOne as (...x: unknown[]) => unknown).apply(t, a)) : Reflect.get(t, p, r)),
      }),
    };
    await assert.rejects(publishAll(broken, "pub@test.ae", metaDefaults, thresholds, site), /disk full/);
    assert.equal(await getOverride(db, "/"), null, "first document rolled back");
    assert.equal(await getOverride(db, "@business"), null);
    assert.equal((await changeHistory(db, "/")).length, 0);
    assert.ok((await getDraft(db, "/")) && (await getDraft(db, "@business")));
    assert.equal(await lastPublished(db), null);
  });
  test("a draft saved again during publishing is kept", async () => {
    const db = await standaloneDb();
    await saveDraft(db, "/", { title: "First draft of the home page title" }, "ed@test.ae");
    const realDelete = db.drafts.deleteOne.bind(db.drafts);
    const racing: Db = {
      ...db,
      drafts: new Proxy(db.drafts, {
        get: (t, p, r) =>
          p === "deleteOne"
            ? async (...a: Parameters<typeof realDelete>) => {
                await saveDraft(db, "/", { title: "Second draft saved meanwhile" }, "ed2@test.ae");
                return realDelete(...a);
              }
            : Reflect.get(t, p, r),
      }),
    };
    await publishAll(racing, "pub@test.ae", metaDefaults, thresholds, site);
    assert.equal((await getOverride(db, "/"))!.fields.title, "First draft of the home page title");
    assert.equal((await getDraft(db, "/"))!.fields.title, "Second draft saved meanwhile");
  });
  test("restore publishes an earlier snapshot as a new version; history is never rewritten", async () => {
    const db = await replicaSetDb();
    const v1 = await publishOverride(db, "@images", { "hero.rail.menu": "Açaí bowl with fresh berries" }, "a@test.ae");
    await publishOverride(db, "@images", { "hero.rail.menu": "Something else entirely here" }, "a@test.ae");
    const r = await publishOverride(db, "@images", (await getChange(db, v1.id))!.after, "pub@test.ae", "restore");
    assert.equal(r.version, 3);
    assert.equal(r.action, "restore");
    assert.deepEqual((await getOverride(db, "@images"))!.fields, { "hero.rail.menu": "Açaí bowl with fresh berries" }, "dotted image keys round-trip");
    assert.deepEqual((await changeHistory(db, "@images")).map((h) => h.version), [3, 2, 1]);
  });
});

describe("public site reads published values only (local MongoDB)", () => {
  test("drafts never reach publishedDoc; published values do", async () => {
    const env = { ...process.env };
    const g = globalThis as { __seoMongo?: unknown };
    delete g.__seoMongo;
    process.env.MONGODB_URI = await replicaSetUri("pressd_seo_public");
    try {
      const { publishedDoc } = await import("../../lib/seo/public.ts");
      const db = await getDb();
      assert.equal(await publishedDoc("/"), null);
      await saveDraft(db, "/", { title: "Unpublished draft title" }, "ed@test.ae");
      assert.equal(await publishedDoc("/"), null, "draft is not public");
      await saveDraft(db, "@business", { telephone: "+971 4 000 0000" }, "ed@test.ae");
      await publishAll(db, "pub@test.ae", metaDefaults, thresholds, site);
      assert.deepEqual(await publishedDoc("/"), { title: "Unpublished draft title" });
      await saveDraft(db, "/", { title: "Next draft, not yet public" }, "ed@test.ae");
      assert.deepEqual(await publishedDoc("/"), { title: "Unpublished draft title" });
      assert.deepEqual(await publishedDoc("@business"), { telephone: "+971 4 000 0000" });
      await db.client.close();
    } finally {
      delete g.__seoMongo;
      process.env = env;
    }
  });
});
