// Menu translations managed in SEO Studio: per-language overlays on top of the
// existing locales/<code>/menu.json files (which are never rewritten).
// Pure module.
//
// Effective dictionary for a language:
//   locales/<code>/menu.json
//   + (English only) names, descriptions, ingredients and category names from
//     the published menu — English menu text has one source, the menu document
//   + the published overlay for that language.
// A missing translation falls back to English at render time and is reported;
// it is never filled in with English in the database.

import type { MenuDictionary } from "../i18n/dictionary.ts";
import { DEFAULT_LOCALE, LOCALE_CODES } from "../i18n/locales.ts";
import { MetadataValidationError } from "../seo/core/metadata.ts";
import { slugify } from "../slugify.ts";
import type { EffectiveMenu } from "./menu.ts";
import { effectiveDictionary } from "./dictionary.ts";
import type { LocaleOverlay, ProductTranslation } from "./dictionary.ts";

export { effectiveDictionary };
export type { LocaleOverlay, ProductTranslation } from "./dictionary.ts";

export type Translations = Record<string, LocaleOverlay>;

const fail = (field: string, message: string): never => {
  throw new MetadataValidationError(field, message);
};
const UNSAFE = /[\u0000-\u001f\u007f<>]/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const tokens = (s: string) => [...s.matchAll(/\{[a-z]+\}/gi)].map((m) => m[0]).sort().join();

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== "string") fail(field, "Must be text");
  if (UNSAFE.test(v as string)) fail(field, "Angle brackets and control characters are not allowed");
  const s = (v as string).replace(/\s+/g, " ").trim();
  if (s.length > max) fail(field, `At most ${max} characters`);
  return s;
}

/** Category slugs and subcategory keys present in the menu (including hidden ones). */
function menuKeys(menu: EffectiveMenu) {
  const categories = new Set(menu.all.map((c) => c.slug));
  const subcategories = new Set<string>();
  for (const c of menu.all) for (const it of c.items) subcategories.add(slugify(it[6]));
  return { categories, subcategories };
}

/**
 * Validates translation overlays. Unknown languages, products, categories and
 * keys are rejected; placeholders such as {name} must be kept; ingredient
 * lists must match the English list item for item. Empty text is dropped
 * (the language then falls back to English for that text).
 */
export function validateTranslations(input: unknown, ctx: { menu: EffectiveMenu; english: MenuDictionary }): Translations {
  if (!isObj(input)) fail("translations", "Must be an object");
  const { categories, subcategories } = menuKeys(ctx.menu);
  const out: Translations = {};
  for (const [locale, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!(LOCALE_CODES as readonly string[]).includes(locale)) fail(locale, `Unknown language "${locale}"`);
    if (!isObj(raw)) fail(locale, "Must be an object");
    const r = raw as Record<string, unknown>;
    const isEn = locale === DEFAULT_LOCALE;
    const allowed = isEn ? ["customization", "ui"] : ["products", "categories", "categoryTaglines", "subcategories", "customization", "ui"];
    for (const k of Object.keys(r)) if (!allowed.includes(k)) fail(`${locale}.${k}`, isEn ? "English product and category text is edited in Menu, not here" : `Unknown section "${k}"`);
    const ov: LocaleOverlay = {};

    if (r.products !== undefined) {
      if (!isObj(r.products)) fail(`${locale}.products`, "Must be an object");
      const products: Record<string, ProductTranslation> = {};
      for (const [id, pr] of Object.entries(r.products as Record<string, unknown>)) {
        const found = ctx.menu.byId.get(id);
        if (!found) fail(`${locale}.products.${id}`, `Unknown product "${id}"`);
        if (!isObj(pr)) fail(`${locale}.products.${id}`, "Invalid product");
        const p = pr as Record<string, unknown>;
        for (const k of Object.keys(p)) if (!["name", "description", "ingredients"].includes(k)) fail(`${locale}.products.${id}.${k}`, `Unknown field "${k}"`);
        const t: ProductTranslation = {};
        if (p.name !== undefined) {
          const s = str(p.name, `${locale}.products.${id}.name`, 80);
          if (s) t.name = s;
        }
        if (p.description !== undefined) {
          const s = str(p.description, `${locale}.products.${id}.description`, 240);
          if (s) t.description = s;
        }
        if (p.ingredients !== undefined) {
          const en = found!.item[5].ingredients ?? [];
          if (!Array.isArray(p.ingredients)) fail(`${locale}.products.${id}.ingredients`, "Must be a list");
          const list = (p.ingredients as unknown[]).map((x, i) => str(x, `${locale}.products.${id}.ingredients.${i}`, 100));
          if (list.some(Boolean)) {
            if (list.length !== en.length || list.some((x) => !x)) fail(`${locale}.products.${id}.ingredients`, `Translate all ${en.length} ingredients (one per English ingredient)`);
            t.ingredients = list;
          }
        }
        if (Object.keys(t).length) products[id] = t;
      }
      if (Object.keys(products).length) ov.products = products;
    }

    for (const [section, keys, max] of [["categories", categories, 40], ["categoryTaglines", categories, 80], ["subcategories", subcategories, 30]] as const) {
      if (r[section] === undefined) continue;
      if (!isObj(r[section])) fail(`${locale}.${section}`, "Must be an object");
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(r[section] as Record<string, unknown>)) {
        if (!keys.has(k)) fail(`${locale}.${section}.${k}`, `Unknown key "${k}"`);
        const s = str(v, `${locale}.${section}.${k}`, max);
        if (s) m[k] = s;
      }
      if (Object.keys(m).length) ov[section] = m;
    }

    if (r.customization !== undefined) {
      if (!isObj(r.customization)) fail(`${locale}.customization`, "Must be an object");
      const c: LocaleOverlay["customization"] = {};
      for (const [group, entries] of Object.entries(r.customization as Record<string, unknown>)) {
        const enGroup = ctx.english.customization[group as "beans" | "milk" | "syrup"];
        if (!enGroup) fail(`${locale}.customization.${group}`, `Unknown group "${group}"`);
        if (!isObj(entries)) fail(`${locale}.customization.${group}`, "Must be an object");
        const m: Record<string, string> = {};
        for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
          if (!(k in enGroup)) fail(`${locale}.customization.${group}.${k}`, `Unknown option "${k}"`);
          const s = str(v, `${locale}.customization.${group}.${k}`, 40);
          if (s) m[k] = s;
        }
        if (Object.keys(m).length) c[group as "beans" | "milk" | "syrup"] = m;
      }
      if (Object.keys(c).length) ov.customization = c;
    }

    if (r.ui !== undefined) {
      if (!isObj(r.ui)) fail(`${locale}.ui`, "Must be an object");
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.ui as Record<string, unknown>)) {
        const en = ctx.english.ui[k];
        if (en === undefined) fail(`${locale}.ui.${k}`, `Unknown label "${k}"`);
        const s = str(v, `${locale}.ui.${k}`, 200);
        if (!s) continue;
        if (tokens(s) !== tokens(en)) fail(`${locale}.ui.${k}`, `Keep the placeholders exactly as in English: ${tokens(en) || "(none)"}`);
        m[k] = s;
      }
      if (Object.keys(m).length) ov.ui = m;
    }
    if (Object.keys(ov).length) out[locale] = ov;
  }
  if (JSON.stringify(out).length > 900_000) fail("translations", "The translations are too large");
  return out;
}

export interface MissingItem {
  kind: "product" | "category" | "tagline" | "subcategory" | "customization" | "ui";
  key: string;
  /** Readable English name of the thing that needs translating. */
  label: string;
  fields: string[];
}

export interface LocaleStatus {
  locale: string;
  total: number;
  missing: MissingItem[];
  /** Products whose English name changed since this language was translated. */
  outdated: { id: string; label: string }[];
  percent: number;
}

/**
 * Translation completeness for one language against the published English
 * menu. `originalEnglish` is locales/en/menu.json, used to spot products whose
 * English name was changed after they were translated.
 */
export function translationStatus(locale: string, base: MenuDictionary | null, menu: EffectiveMenu, overlay: LocaleOverlay | undefined, english: MenuDictionary, originalEnglish: MenuDictionary): LocaleStatus {
  const d = effectiveDictionary(locale, base, menu, overlay);
  const missing: MissingItem[] = [];
  const outdated: { id: string; label: string }[] = [];
  let total = 0;
  for (const c of menu.all) {
    total += 2;
    if (!d.categories[c.slug]) missing.push({ kind: "category", key: c.slug, label: c.category, fields: ["name"] });
    if (c.tagline && !d.categoryTaglines[c.slug]) missing.push({ kind: "tagline", key: c.slug, label: c.category, fields: ["tagline"] });
    for (const it of c.items) {
      total += 3;
      const t = d.products[it[7]];
      const enIngredients = it[5].ingredients ?? [];
      const fields: string[] = [];
      if (!t?.name) fields.push("name");
      if (!t?.description) fields.push("description");
      if (enIngredients.length && (!t?.ingredients || t.ingredients.length !== enIngredients.length)) fields.push("ingredients");
      if (fields.length) missing.push({ kind: "product", key: it[7], label: it[0], fields });
      const orig = originalEnglish.products[it[7]]?.name;
      if (locale !== DEFAULT_LOCALE && orig && orig !== it[0] && !overlay?.products?.[it[7]]?.name) outdated.push({ id: it[7], label: it[0] });
    }
  }
  for (const s of Object.keys(menu.subcategoryNames)) {
    total += 1;
    if (!d.subcategories[s]) missing.push({ kind: "subcategory", key: s, label: menu.subcategoryNames[s], fields: ["name"] });
  }
  for (const g of ["beans", "milk", "syrup"] as const) {
    for (const k of Object.keys(english.customization[g])) {
      total += 1;
      if (!d.customization[g][k]) missing.push({ kind: "customization", key: `${g}.${k}`, label: english.customization[g][k], fields: ["label"] });
    }
  }
  for (const k of Object.keys(english.ui)) {
    total += 1;
    if (!d.ui[k]) missing.push({ kind: "ui", key: k, label: english.ui[k], fields: ["text"] });
  }
  const gaps = missing.reduce((n, m) => n + m.fields.length, 0);
  return { locale, total, missing, outdated, percent: total ? Math.max(0, Math.round(((total - gaps) / total) * 100)) : 100 };
}
