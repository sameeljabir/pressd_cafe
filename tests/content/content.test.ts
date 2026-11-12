// Content & menu management (SEO Studio CMS): page content, menu overrides,
// translations, hours, the image library and the document registry.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { menu as BASE } from "../../data/menu.ts";
import { ABOUT, HERO, PAGE_SCHEMAS, VISIT, BOOKING } from "../../lib/content/pages.ts";
import { contentDiff, missingTranslations, resolveContent, validateContent, textPaths } from "../../lib/content/schema.ts";
import { IMAGE_LIBRARY, LIBRARY_SRCS, isLibraryImage } from "../../lib/content/library.ts";
import { buildEffectiveMenu, formatNutrition, menuDiff, newProductId, NEW_ID, NUTRITION, parseNutrition, validateMenu, validatePrice } from "../../lib/content/menu.ts";
import { effectiveDictionary, translationStatus, validateTranslations } from "../../lib/content/translations.ts";
import { DICTIONARIES, ENGLISH } from "../../lib/content/dictionaries.ts";
import { phoneDigits, socialHandle, to12h, visibleHours, whatsappLink } from "../../lib/content/hours.ts";
import { buildSiteContent, effectiveSiteImages, expectedContent } from "../../lib/content/site.ts";
import { refreshCart } from "../../lib/content/cartRefresh.ts";
import { BUSINESS_DEFAULTS, validateBusiness, buildJsonLd } from "../../lib/seo/core/business.ts";
import { DOC_KEYS, MENU_KEY, TRANSLATIONS_KEY, diffRows, docPermission, isDocKey, validateDoc } from "../../lib/seo/core/docs.ts";
import { can, type Role } from "../../lib/seo/core/permissions.ts";
import { defaultsFrom, MetadataValidationError } from "../../lib/seo/core/metadata.ts";
import { parseSiteUrl } from "../../lib/seo/core/url.ts";
import { LOCALE_CODES } from "../../lib/i18n/locales.ts";
import { SITE_IMAGES } from "../../lib/siteImages.ts";
import snapshot from "./fixtures/menu-snapshot.json" with { type: "json" };

const site = parseSiteUrl("https://www.pressdcafe.ae");
const metaDefaults = defaultsFrom({ title: "PRESS'D | Specialty Coffee", description: "Default description", alternates: { canonical: "/" } }, site);
const ctx = { images: LIBRARY_SRCS };
const invalid = (fn: () => unknown, field?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof MetadataValidationError && (!field || field.test((e as MetadataValidationError).field)));

describe("page content", () => {
  test("nothing published resolves to the code defaults, in every language", () => {
    for (const s of PAGE_SCHEMAS) {
      for (const locale of LOCALE_CODES) {
        const r = resolveContent(s, null, locale);
        assert.deepEqual(r.shared, s.defaults.shared);
        for (const p of textPaths(s, null)) assert.equal(r.text[p.path], s.defaults.text[p.path], `${s.key} ${locale} ${p.path}`);
      }
      assert.deepEqual(validateContent(s, {}, ctx), {}, s.key);
    }
  });

  test("every default text path exists and every image default is in the library", () => {
    for (const s of PAGE_SCHEMAS) {
      for (const p of textPaths(s, null)) assert.ok(s.defaults.text[p.path], `${s.key}: default for ${p.path}`);
      for (const [f, spec] of Object.entries(s.fields)) if (spec.kind === "image") assert.ok(isLibraryImage(s.defaults.shared[f]), `${s.key}.${f}`);
    }
  });

  test("language → English override → code default", () => {
    const doc = validateContent(HERO, { text: { en: { eyebrow: "New eyebrow" }, it: { headline1: "Ciao" } } }, ctx);
    assert.equal(resolveContent(HERO, doc, "it").text.headline1, "Ciao");
    assert.equal(resolveContent(HERO, doc, "it").text.eyebrow, "New eyebrow");
    assert.equal(resolveContent(HERO, doc, "fr").text.headline1, HERO.defaults.text.headline1);
    assert.ok(missingTranslations(HERO, doc).it.includes("eyebrow"));
  });

  test("only overrides are stored; English is never copied into other languages", () => {
    const doc = validateContent(HERO, { shared: { cardMenuImage: HERO.defaults.shared.cardMenuImage }, text: { en: { eyebrow: HERO.defaults.text.eyebrow, headline1: "  Two   words " }, it: { headline1: "" } } }, ctx);
    assert.deepEqual(doc, { text: { en: { headline1: "Two words" } } });
  });

  test("strict validation", () => {
    invalid(() => validateContent(HERO, { text: { en: { nope: "x" } } }, ctx), /nope/);
    invalid(() => validateContent(HERO, { text: { xx: { eyebrow: "x" } } }, ctx), /xx/);
    invalid(() => validateContent(HERO, { text: { en: { eyebrow: "<script>" } } }, ctx));
    invalid(() => validateContent(HERO, { text: { en: { eyebrow: "x".repeat(500) } } }, ctx));
    invalid(() => validateContent(HERO, { other: {} }, ctx));
    invalid(() => validateContent(HERO, { shared: { cardMenuImage: "https://evil.example/x.jpg" } }, ctx), /cardMenuImage/);
    invalid(() => validateContent(HERO, { shared: { cardMenuImage: "/assets/does-not-exist.webp" } }, ctx), /cardMenuImage/);
    invalid(() => validateContent(ABOUT, { shared: { showPull: "yes" } }, ctx), /showPull/);
  });

  test("lists: ids, bounds, required English text for new items", () => {
    const values = ABOUT.defaults.shared.values as { id: string; icon: string }[];
    invalid(() => validateContent(ABOUT, { shared: { values: values.slice(0, 1) } }, ctx), /values/);
    invalid(() => validateContent(ABOUT, { shared: { values: [...values, { id: "extra", icon: "pet" }] } }, ctx), /values/);
    invalid(() => validateContent(ABOUT, { shared: { values: [values[0], values[0]] } }, ctx), /values/);
    invalid(() => validateContent(ABOUT, { shared: { values: [values[0], { id: "new", icon: "pet" }] } }, ctx), /values\.new/);
    const ok = validateContent(ABOUT, { shared: { values: [values[1], values[0]] } }, ctx);
    assert.deepEqual((ok.shared!.values as { id: string }[]).map((v) => v.id), ["pet", "wellness"]);
    // Text of removed items is dropped, not an error.
    assert.deepEqual(validateContent(ABOUT, { shared: { values: values.slice(0, 2) }, text: { it: { "values.coffee.name": "Caffè" } } }, ctx).text, undefined);
  });

  test("diff lists visible changes per language", () => {
    const after = validateContent(VISIT, { shared: { showNote: false }, text: { en: { colophonTag: "New" }, ar: { colophonTag: "جديد" } } }, ctx);
    const rows = contentDiff(VISIT, null, after);
    assert.equal(rows.length, 3);
    assert.ok(rows.some((r) => r.label.includes("(ar)") && r.after === "جديد"));
    assert.deepEqual(contentDiff(VISIT, after, after), []);
  });

  test("booking guest options stay as written today", () => {
    const r = resolveContent(BOOKING, null, "en");
    assert.deepEqual((r.shared.guests as { id: string }[]).map((g) => r.text[`guests.${g.id}.label`]), ["2 guests", "3 guests", "4 guests", "5+ guests"]);
  });
});

describe("menu", () => {
  const effective = buildEffectiveMenu(BASE, null);

  test("product IDs, prices, subcategories and nutrition are unchanged (frozen snapshot)", () => {
    assert.deepEqual(
      effective.categories.map((c) => ({
        slug: c.slug,
        category: c.category,
        items: c.items.map((i) => ({ id: i[7], name: i[0], price: i[2], column: i[6], nutrition: Object.fromEntries(NUTRITION.map((k) => [k, i[5][k] ?? null])) })),
      })),
      snapshot,
    );
    assert.equal(effective.byId.size, 98);
  });

  test("the effective menu without overrides is the code menu", () => {
    assert.deepEqual(effective.categories, BASE);
    assert.deepEqual(effective.all, BASE);
    assert.deepEqual(validateMenu({}, BASE), {});
  });

  test("nutrition strings round-trip", () => {
    for (const c of BASE) for (const it of c.items) for (const k of NUTRITION) {
      const s = it[5][k];
      if (s) assert.equal(formatNutrition(k, parseNutrition(s)!), s, `${it[7]} ${k}`);
    }
  });

  test("prices", () => {
    assert.equal(validatePrice(26), 26);
    assert.equal(validatePrice(26.5), 26.5);
    for (const bad of [0, -1, 26.555, 20000, NaN, "26", null]) invalid(() => validatePrice(bad));
  });

  test("edits are stored minimally and applied by ID; renames keep the ID", () => {
    const [id] = [BASE[0].items[0][7]];
    const o = validateMenu({ products: { [id]: { name: "Avocado Toast", price: BASE[0].items[0][2], calories: 512, fat: null } } }, BASE);
    assert.deepEqual(o, { products: { [id]: { name: "Avocado Toast", calories: 512, fat: null } } });
    const m = buildEffectiveMenu(BASE, o);
    const it = m.byId.get(id)!.item;
    assert.equal(it[0], "Avocado Toast");
    assert.equal(it[7], id);
    assert.equal(it[5].calories, "512 kcal");
    assert.equal(it[5].fat, undefined);
    assert.equal(BASE[0].items[0][0], "Avocado Toast with Poached Eggs", "code menu is not mutated");
  });

  test("hide, reorder, move and add", () => {
    const [a, b] = BASE[0].items.map((i) => i[7]);
    const newId = newProductId(() => 0.5);
    assert.match(newId, NEW_ID);
    const o = validateMenu(
      {
        products: { [a]: { hidden: true } },
        order: { [BASE[0].slug]: [b] },
        added: [{ id: newId, name: "New Bowl", description: "A new bowl", price: 39, category: BASE[1].slug, column: BASE[1].items[0][6], image: BASE[0].items[0][3] }],
        categoryOrder: [BASE[1].slug],
      },
      BASE,
    );
    const m = buildEffectiveMenu(BASE, o);
    assert.equal(m.categories[0].slug, BASE[1].slug);
    assert.ok(!m.categories.flatMap((c) => c.items).some((i) => i[7] === a), "hidden product not public");
    assert.ok(m.byId.has(a), "hidden product still resolvable for carts");
    assert.equal(m.categories.find((c) => c.slug === BASE[0].slug)!.items[0][7], b);
    assert.ok(m.categories.find((c) => c.slug === BASE[1].slug)!.items.some((i) => i[7] === newId));
    assert.equal(m.byId.size, 99);
    const rows = menuDiff(BASE, null, o);
    assert.ok(rows.some((r) => r.label.includes("New product")));
    assert.ok(rows.some((r) => r.label.endsWith("Visibility") && r.after === "Hidden"));
  });

  test("strict validation", () => {
    const id = BASE[0].items[0][7];
    invalid(() => validateMenu({ products: { "no-such": { price: 1 } } }, BASE));
    invalid(() => validateMenu({ products: { [id]: { price: -3 } } }, BASE));
    invalid(() => validateMenu({ products: { [id]: { image: "https://x.example/a.jpg" } } }, BASE));
    invalid(() => validateMenu({ products: { [id]: { tag: "GF" } } }, BASE));
    invalid(() => validateMenu({ products: { [id]: { calories: -5 } } }, BASE));
    invalid(() => validateMenu({ products: { [id]: { secret: 1 } } }, BASE));
    invalid(() => validateMenu({ products: { [id]: { name: "<b>x</b>" } } }, BASE));
    invalid(() => validateMenu({ added: [{ id: "avacado-toast-with-poached-eggs", name: "x", description: "x", price: 1, category: BASE[0].slug, column: "x", image: BASE[0].items[0][3] }] }, BASE));
    invalid(() => validateMenu({ added: [{ id: "p-abcdefgh", name: "x" }] }, BASE));
    invalid(() => validateMenu({ addedCategories: [{ slug: "menu", name: "x", tagline: "" }] }, BASE));
    invalid(() => validateMenu({ order: { [BASE[0].slug]: [id, id] } }, BASE));
    invalid(() => validateMenu({ categories: Object.fromEntries(BASE.map((c) => [c.slug, { hidden: true }])) }, BASE), /menu/);
  });
});

describe("translations", () => {
  const menu = buildEffectiveMenu(BASE, null);
  const pid = BASE[0].items[0][7];

  test("all 12 language files are present with the same keys as English", () => {
    assert.deepEqual(Object.keys(DICTIONARIES).sort(), [...LOCALE_CODES].sort());
    for (const [code, d] of Object.entries(DICTIONARIES)) {
      for (const section of ["categories", "categoryTaglines", "subcategories", "products", "ui"] as const) {
        assert.deepEqual(Object.keys(d[section]).sort(), Object.keys(ENGLISH[section]).sort(), `${code}.${section}`);
      }
    }
  });

  test("English menu text comes from the menu; nothing published = the language files", () => {
    for (const code of LOCALE_CODES) {
      const d = effectiveDictionary(code, DICTIONARIES[code], menu, undefined);
      if (code !== "en") assert.deepEqual(d, DICTIONARIES[code], code);
    }
    const renamed = buildEffectiveMenu(BASE, validateMenu({ products: { [pid]: { name: "Avocado Toast" } } }, BASE));
    assert.equal(effectiveDictionary("en", ENGLISH, renamed, undefined).products[pid].name, "Avocado Toast");
  });

  test("overlays, fallbacks and completeness", () => {
    const t = validateTranslations({ it: { products: { [pid]: { name: "Toast" } }, ui: { addAria: "Aggiungi {name}" } } }, { menu, english: ENGLISH });
    const d = effectiveDictionary("it", DICTIONARIES.it, menu, t.it);
    assert.equal(d.products[pid].name, "Toast");
    assert.equal(d.products[pid].description, DICTIONARIES.it.products[pid].description);
    assert.equal(d.ui.addAria, "Aggiungi {name}");
    const s = translationStatus("it", DICTIONARIES.it, menu, t.it, ENGLISH, ENGLISH);
    assert.ok(s.percent > 0 && s.percent <= 100);
    // A product renamed in English is flagged as outdated in other languages.
    const renamed = buildEffectiveMenu(BASE, validateMenu({ products: { [pid]: { name: "Avocado Toast" } } }, BASE));
    const en = effectiveDictionary("en", ENGLISH, renamed, undefined);
    assert.ok(translationStatus("fr", DICTIONARIES.fr, renamed, undefined, en, ENGLISH).outdated.some((o) => o.id === pid));
    // A new product is missing in every other language until translated (never filled with English).
    const added = buildEffectiveMenu(BASE, validateMenu({ added: [{ id: "p-abcdefgh", name: "New", description: "New one", price: 10, category: BASE[0].slug, column: BASE[0].items[0][6], image: BASE[0].items[0][3] }] }, BASE));
    assert.ok(translationStatus("ja", DICTIONARIES.ja, added, undefined, en, ENGLISH).missing.some((m) => m.key === "p-abcdefgh"));
    assert.equal(effectiveDictionary("ja", DICTIONARIES.ja, added, undefined).products["p-abcdefgh"], undefined);
  });

  test("strict validation", () => {
    const c = { menu, english: ENGLISH };
    invalid(() => validateTranslations({ xx: {} }, c));
    invalid(() => validateTranslations({ en: { products: {} } }, c));
    invalid(() => validateTranslations({ it: { products: { nope: { name: "x" } } } }, c));
    invalid(() => validateTranslations({ it: { ui: { addAria: "Aggiungi" } } }, c), /addAria/);
    invalid(() => validateTranslations({ it: { ui: { nope: "x" } } }, c));
    invalid(() => validateTranslations({ it: { products: { [pid]: { ingredients: ["uno"] } } } }, c), /ingredients/);
    invalid(() => validateTranslations({ it: { categories: { nope: "x" } } }, c));
    assert.deepEqual(validateTranslations({ it: { products: { [pid]: { name: "  " } } } }, c), {});
  });
});

describe("hours and contact details", () => {
  test("business hours render the Visit card exactly as today", () => {
    assert.deepEqual(visibleHours(BUSINESS_DEFAULTS.openingHours), [
      ...["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, hours: "7:00 AM – 9:00 PM" })),
      { day: "SAT & SUN", hours: "7:00 AM – 9:00 PM" },
    ]);
    assert.equal(to12h("00:00"), "12:00 AM");
    assert.equal(to12h("12:30"), "12:30 PM");
    const split = visibleHours([{ days: "Mo-Fr", opens: "07:00", closes: "21:00" }, { days: "Sa", opens: "08:00", closes: "22:00" }]);
    assert.deepEqual(split.slice(-2), [{ day: "SAT", hours: "8:00 AM – 10:00 PM" }, { day: "SUN", hours: "Closed" }]);
  });

  test("official numbers and links", () => {
    assert.equal(phoneDigits(BUSINESS_DEFAULTS.telephone), "971556838426");
    assert.equal(phoneDigits(BUSINESS_DEFAULTS.whatsapp), "971556838426");
    assert.equal(socialHandle(BUSINESS_DEFAULTS.instagram), "@pressd.cafe");
    assert.equal(socialHandle(BUSINESS_DEFAULTS.tiktok), "@pressd.cafe");
  });

  test("new business fields are validated and not emitted as structured data", () => {
    assert.deepEqual(validateBusiness({ ...BUSINESS_DEFAULTS }), {});
    assert.deepEqual(validateBusiness({ instagram: "https://www.instagram.com/pressd.new" }), { instagram: "https://www.instagram.com/pressd.new" });
    invalid(() => validateBusiness({ instagram: "https://evil.example/pressd" }));
    invalid(() => validateBusiness({ instagram: "http://www.instagram.com/pressd" }));
    invalid(() => validateBusiness({ mapsUrl: "javascript:alert(1)" }));
    invalid(() => validateBusiness({ whatsapp: "call me" }));
    invalid(() => validateBusiness({ addressLines: ["a", "b", "c", "d", "e"] }));
    const ld = JSON.stringify(buildJsonLd({ instagram: "https://www.instagram.com/x", whatsapp: "+971 50 000 0000" }));
    assert.ok(!ld.includes("instagram.com/x") && !ld.includes("50 000"));
  });
});

describe("image library", () => {
  test("the manifest lists every image in public/assets (run scripts/gen-image-library.mts after adding one)", () => {
    const dir = join(import.meta.dirname, "../../public/assets");
    const files = readdirSync(dir).filter((f) => /\.(webp|jpe?g|png|avif|gif|svg)$/i.test(f) && statSync(join(dir, f)).isFile());
    assert.deepEqual(IMAGE_LIBRARY.map((i) => i.src).sort(), files.map((f) => `/assets/${f}`).sort());
  });

  test("only library images are selectable", () => {
    assert.ok(isLibraryImage(SITE_IMAGES[0].src));
    for (const bad of ["https://x.example/a.webp", "/assets/../.env", "//evil.example/a.webp", "/assets/missing.webp", 42]) assert.ok(!isLibraryImage(bad), String(bad));
  });

  test("every menu and page image is in the library", () => {
    for (const c of BASE) for (const it of c.items) assert.ok(isLibraryImage(it[3]), it[3]);
    for (const i of SITE_IMAGES) assert.ok(isLibraryImage(i.src), i.src);
  });

  test("assigned page images are what the live check expects", () => {
    const hero = validateContent(HERO, { shared: { cardMenuImage: BASE[0].items[0][3] } }, ctx);
    const img = effectiveSiteImages({ "@content:hero": hero }, null).find((i) => i.key === "hero.rail.menu")!;
    assert.equal(img.src, BASE[0].items[0][3]);
    assert.deepEqual(effectiveSiteImages({}, null).map((i) => i.src), SITE_IMAGES.map((i) => i.src));
  });
});

describe("document registry and roles", () => {
  test("every content document is registered; menu publishes before translations", () => {
    for (const s of PAGE_SCHEMAS) assert.ok(isDocKey(s.key));
    assert.ok(isDocKey(MENU_KEY) && isDocKey(TRANSLATIONS_KEY));
    assert.ok(DOC_KEYS.indexOf(MENU_KEY) < DOC_KEYS.indexOf(TRANSLATIONS_KEY));
    assert.ok(!isDocKey("@content:other"));
  });

  test("permissions per document and role", () => {
    const allowed = (role: Role, key: (typeof DOC_KEYS)[number], action: "draft" | "publish") => can(role, docPermission(key, action));
    for (const key of DOC_KEYS) {
      assert.ok(!allowed("viewer", key, "draft"));
      assert.ok(allowed("editor", key, "draft"), key);
      assert.ok(!allowed("editor", key, "publish"), key);
      assert.ok(allowed("publisher", key, "publish"), key);
      assert.ok(allowed("admin", key, "publish"), key);
    }
    assert.ok(!can("publisher", "settings:manage"), "publisher cannot change settings");
  });

  test("validateDoc routes content documents; translations follow the menu being published", () => {
    assert.deepEqual(validateDoc("@content:hero", {}, site), {});
    const newProduct = { id: "p-abcdefgh", name: "New", description: "New one", price: 10, category: BASE[0].slug, column: BASE[0].items[0][6], image: BASE[0].items[0][3] };
    const menuDoc = validateDoc(MENU_KEY, { added: [newProduct] }, site);
    invalid(() => validateDoc(TRANSLATIONS_KEY, { it: { products: { "p-abcdefgh": { name: "Nuovo" } } } }, site));
    assert.ok(validateDoc(TRANSLATIONS_KEY, { it: { products: { "p-abcdefgh": { name: "Nuovo" } } } }, site, { menu: menuDoc as never }));
    assert.ok(diffRows(MENU_KEY, null, menuDoc, metaDefaults).length > 0);
    assert.ok(diffRows("@content:hero", null, { text: { en: { eyebrow: "x" } } }, metaDefaults).length === 1);
  });

  test("buildSiteContent with nothing published = code defaults", () => {
    const c = buildSiteContent({}, BASE, false);
    assert.deepEqual(c.pages, {});
    assert.equal(c.menu, null, "the client uses its bundled code menu");
    assert.equal(c.subcategoryNames, null);
    const withMenu = buildSiteContent({ "@content:menu": { categoryOrder: [BASE[1].slug] } }, BASE, false);
    assert.equal(withMenu.menu![0].slug, BASE[1].slug);
    assert.deepEqual(c.hiddenItems, []);
    assert.deepEqual(c.business, BUSINESS_DEFAULTS);
    assert.deepEqual(c.translations, {});
  });
});

describe("cart and links", () => {
  test("saved carts are re-priced from the published menu; hidden products are removed", () => {
    const piccolo = BASE.flatMap((c) => c.items).find((i) => i[7] === "piccolo")!;
    const line = (id: string, price: number) => ({ id, name: "old", basePrice: price, price, image: "", instructions: "", customization: null as never, qty: 2 });
    const same = buildEffectiveMenu(BASE, null);
    const lookup = { byId: new Map([...same.byId].map(([k, v]) => [k, v.item])) };
    assert.deepEqual(refreshCart([line("piccolo", piccolo[2])], lookup, () => false).map((l) => [l.price, l.name]), [[piccolo[2], piccolo[0]]]);
    const changed = buildEffectiveMenu(BASE, validateMenu({ products: { piccolo: { price: piccolo[2] + 1 } } }, BASE));
    const lookup2 = { byId: new Map([...changed.byId].map(([k, v]) => [k, v.item])) };
    const out = refreshCart([line("piccolo", piccolo[2]), line("tuna-melt", 39), line("legacy-unknown", 5)], lookup2, (id) => id === "tuna-melt");
    assert.deepEqual(out.map((l) => [l.id, l.price, l.qty]), [["piccolo", piccolo[2] + 1, 2], ["legacy-unknown", 5, 2]]);
  });

  test("WhatsApp links are byte-identical to the ones the site used", () => {
    assert.equal(whatsappLink(BUSINESS_DEFAULTS.whatsapp, "Hello PRESS'D!"), "https://wa.me/971556838426?text=Hello%20PRESS%27D!");
    assert.equal(whatsappLink(BUSINESS_DEFAULTS.whatsapp, "Hello PRESS'D! I'd like to place an order."), "https://wa.me/971556838426?text=Hello%20PRESS%27D!%20I%27d%20like%20to%20place%20an%20order.");
  });

  test("the live check expects visible text and images only", () => {
    const base = expectedContent({}, null, BASE);
    assert.ok(base.texts.includes("GOOD FOOD.") && base.texts.includes(BASE[0].items[0][0]));
    assert.ok(!base.texts.includes("Your name"), "placeholders are attributes");
    assert.deepEqual(base.images.map((i) => i.src), SITE_IMAGES.map((i) => i.src));
    const about = validateContent(ABOUT, { shared: { showPull: false, showPhoto: false } }, ctx);
    const hidden = expectedContent({ "@content:about": about }, null, BASE);
    assert.ok(!hidden.texts.includes(ABOUT.defaults.text.pull));
    assert.ok(!hidden.images.some((i) => i.key === "about.story.interior"));
  });
});
