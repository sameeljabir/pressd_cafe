// Content documents through the real Draft → Confirm & Publish → Restore path (local MongoDB).
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { menu as BASE } from "../../data/menu.ts";
import { MENU_KEY, TRANSLATIONS_KEY } from "../../lib/seo/core/docs.ts";
import { defaultsFrom } from "../../lib/seo/core/metadata.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import type { Db } from "../../lib/seo/db/mongo.ts";
import { menuContext, pendingChanges, publishAll } from "../../lib/seo/services/docs.ts";
import { DraftConflictError, getDraft, getOverride, saveDraft } from "../../lib/seo/services/metadata.ts";
import { replicaSetDb } from "../seo/mongo-helper.ts";
import type { Translations } from "../../lib/content/translations.ts";
import type { ContentDoc } from "../../lib/content/schema.ts";

const site = parseSiteUrl("https://www.pressdcafe.ae");
const metaDefaults = defaultsFrom({ title: "PRESS'D | Specialty Coffee", description: "Default description", alternates: { canonical: "/" } }, site);
const thresholds = { titleMin: 30, titleMax: 60, descriptionMin: 70, descriptionMax: 160 };
const NEW = { id: "p-abcdefgh", name: "New Bowl", description: "A new bowl", price: 39, category: BASE[0].slug, column: BASE[0].items[0][6], image: BASE[0].items[0][3] };

describe("content publishing", () => {
  let db: Db;
  before(async () => {
    db = await replicaSetDb();
  });

  test("draft conflicts: a stale editor cannot overwrite a newer draft", async () => {
    const first = await saveDraft(db, "@content:hero", { text: { en: { eyebrow: "One" } } }, "a@test.ae", null);
    await assert.rejects(saveDraft(db, "@content:hero", { text: { en: { eyebrow: "Two" } } }, "b@test.ae", null), DraftConflictError);
    const second = await saveDraft(db, "@content:hero", { text: { en: { eyebrow: "Two" } } }, "b@test.ae", first.savedAt.toISOString());
    await assert.rejects(saveDraft(db, "@content:hero", { text: { en: { eyebrow: "Three" } } }, "a@test.ae", first.savedAt.toISOString()), DraftConflictError);
    assert.deepEqual((await getDraft(db, "@content:hero"))!.fields, { text: { en: { eyebrow: "Two" } } });
    assert.ok(second.savedAt >= first.savedAt);
  });

  test("a new product and its translation publish together, menu first", async () => {
    await saveDraft(db, MENU_KEY, { added: [NEW] }, "ed@test.ae");
    // Translation validated against the menu draft at save time…
    assert.ok((await menuContext(db)).menu?.added?.length === 1);
    await saveDraft(db, TRANSLATIONS_KEY, { it: { products: { [NEW.id]: { name: "Nuova Bowl" } } } }, "ed@test.ae");
    const pending = await pendingChanges(db, metaDefaults, thresholds, site);
    assert.deepEqual(pending.map((p) => p.key), ["@content:hero", MENU_KEY, TRANSLATIONS_KEY]);
    // …and again at publish, against the menu going live with it.
    const changes = await publishAll(db, "pub@test.ae", metaDefaults, thresholds, site);
    assert.deepEqual(changes.map((c) => c.key), ["@content:hero", MENU_KEY, TRANSLATIONS_KEY]);
    assert.equal(((await getOverride(db, TRANSLATIONS_KEY))!.fields as unknown as Translations).it.products![NEW.id].name, "Nuova Bowl");
    assert.equal(await getDraft(db, MENU_KEY), null);
  });

  test("a translation for a product that is not going live blocks the whole publish", async () => {
    await saveDraft(db, TRANSLATIONS_KEY, { it: { products: { "p-zzzzzzzz": { name: "Fantasma" } } } }, "ed@test.ae");
    await saveDraft(db, "@content:hero", { text: { en: { eyebrow: "Changed" } } }, "ed@test.ae");
    await assert.rejects(publishAll(db, "pub@test.ae", metaDefaults, thresholds, site));
    assert.equal(((await getOverride(db, "@content:hero"))!.fields as ContentDoc).text!.en.eyebrow, "Two", "nothing went live");
  });
});
