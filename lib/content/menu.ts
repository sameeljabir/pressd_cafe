// Menu management: overrides published from SEO Studio, layered on top of the
// code menu (data/menu.ts). Pure module.
//
// Product identity: every product keeps its ID for life.
//  - Existing products use the IDs data/menu.ts has always produced (frozen by
//    tests/content/menu.test.ts); renaming a product here never changes its ID.
//  - New products get a generated ID ("p-…") when they are created.
// Carts, saved customisations and all 12 translation files are keyed by these IDs.
// "Removing" a product hides it; nothing is ever deleted.

import type { MenuCategory, MenuItem, ProductDetails } from "../../data/menu.ts";
import { slugify } from "../slugify.ts";
import { MetadataValidationError } from "../seo/core/metadata.ts";
import { isLibraryImage } from "./library.ts";

export const NUTRITION = ["calories", "protein", "carbohydrates", "fat", "fibre"] as const;
export type NutritionKey = (typeof NUTRITION)[number];
export const NUTRITION_LABEL: Record<NutritionKey, string> = { calories: "Calories (kcal)", protein: "Protein (g)", carbohydrates: "Carbohydrates (g)", fat: "Fat (g)", fibre: "Fibre (g)" };
const NUTRITION_MAX: Record<NutritionKey, number> = { calories: 20000, protein: 2000, carbohydrates: 2000, fat: 2000, fibre: 2000 };
export const TAGS = ["", "V", "VG"] as const;
export const CUSTOMIZE = ["auto", "full", "milk-only", "none"] as const;
export type CustomizeChoice = (typeof CUSTOMIZE)[number];
/** Category slugs are page anchors, so they must not collide with the site's sections. */
export const RESERVED_SLUGS = new Set(["home", "about", "visit", "menu", "book", "all", "signature", "work", "why", "wellness", "gallery", "instagram", "content"]);

export interface ProductPatch {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  column?: string;
  ingredients?: string[];
  image?: string;
  imageAlt?: string;
  tag?: string;
  size?: string;
  customize?: CustomizeChoice;
  calories?: number | null;
  protein?: number | null;
  carbohydrates?: number | null;
  fat?: number | null;
  fibre?: number | null;
  hidden?: boolean;
}
export interface NewProduct extends ProductPatch {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  column: string;
  image: string;
}
export interface CategoryPatch {
  name?: string;
  tagline?: string;
  hidden?: boolean;
}
export interface NewCategory {
  slug: string;
  name: string;
  tagline: string;
}
export interface MenuOverrides {
  products?: Record<string, ProductPatch>;
  added?: NewProduct[];
  /** Product IDs in display order, per category (unlisted products keep their order after these). */
  order?: Record<string, string[]>;
  categories?: Record<string, CategoryPatch>;
  addedCategories?: NewCategory[];
  categoryOrder?: string[];
  /** English names of subcategories, keyed by slugify(original label). */
  subcategories?: Record<string, { name: string }>;
}

export interface EffectiveMenu {
  /** What the public menu shows: visible categories with their visible products, in order. */
  categories: MenuCategory[];
  /** Every category and product, including hidden ones (dashboard, carts). */
  all: MenuCategory[];
  byId: Map<string, { item: MenuItem; category: MenuCategory }>;
  hidden: Set<string>;
  hiddenCategories: Set<string>;
  /** English subcategory names, keyed by slugify(label). */
  subcategoryNames: Record<string, string>;
}

// ---------- nutrition formatting (same strings as data/menu.ts) ----------

export function parseNutrition(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function formatNutrition(key: NutritionKey, n: number): string {
  if (key === "calories") return `${n >= 1000 ? n.toLocaleString("en-US") : String(n)} kcal`;
  return `${n} g`;
}

// ---------- effective menu ----------

const cloneItem = (i: MenuItem): MenuItem => [i[0], i[1], i[2], i[3], i[4], { ...i[5], ingredients: [...(i[5].ingredients ?? [])] }, i[6], i[7]];

function applyPatch(item: MenuItem, p: ProductPatch): MenuItem {
  const out = cloneItem(item);
  if (p.name !== undefined) out[0] = p.name;
  if (p.description !== undefined) out[1] = p.description;
  if (p.price !== undefined) out[2] = p.price;
  if (p.image !== undefined) out[3] = p.image;
  if (p.tag !== undefined) out[4] = p.tag;
  if (p.column !== undefined) out[6] = p.column;
  const d: ProductDetails = out[5];
  if (p.ingredients !== undefined) d.ingredients = [...p.ingredients];
  if (p.size !== undefined) d.size = p.size || undefined;
  if (p.imageAlt !== undefined) d.imageAlt = p.imageAlt || undefined;
  if (p.customize !== undefined) d.customize = p.customize === "auto" ? undefined : p.customize;
  for (const k of NUTRITION) {
    const v = p[k];
    if (v === undefined) continue;
    d[k] = v === null ? undefined : formatNutrition(k, v);
  }
  return out;
}

function newItem(p: NewProduct): MenuItem {
  const base: MenuItem = [p.name, p.description, p.price, p.image, p.tag ?? "", { ingredients: [...(p.ingredients ?? [])] }, p.column, p.id];
  return applyPatch(base, { ...p, name: undefined, description: undefined, price: undefined, image: undefined, column: undefined, ingredients: undefined });
}

/** The menu as published: code menu + overrides. The code menu is never mutated. */
export function buildEffectiveMenu(base: readonly MenuCategory[], o: MenuOverrides | null | undefined): EffectiveMenu {
  const ov = o ?? {};
  const cats: MenuCategory[] = base.map((c) => ({ ...c, items: [] }));
  for (const nc of ov.addedCategories ?? []) cats.push({ category: nc.name, slug: nc.slug, tagline: nc.tagline, items: [] });
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const hidden = new Set<string>();

  const place = (item: MenuItem, home: string, patch: ProductPatch | undefined) => {
    const target = bySlug.get(patch?.category ?? home) ?? bySlug.get(home);
    target?.items.push(item);
    if (patch?.hidden) hidden.add(item[7]);
  };
  for (const c of base) for (const it of c.items) {
    const patch = ov.products?.[it[7]];
    place(patch ? applyPatch(it, patch) : cloneItem(it), c.slug, patch);
  }
  for (const np of ov.added ?? []) {
    const patch = ov.products?.[np.id];
    place(patch ? applyPatch(newItem(np), patch) : newItem(np), np.category, patch ?? np);
  }

  const hiddenCategories = new Set<string>();
  for (const c of cats) {
    const cp = ov.categories?.[c.slug];
    if (cp?.name) c.category = cp.name;
    if (cp?.tagline !== undefined) c.tagline = cp.tagline;
    if (cp?.hidden) hiddenCategories.add(c.slug);
    const order = ov.order?.[c.slug];
    if (order?.length) {
      const rank = new Map(order.map((id, i) => [id, i]));
      const original = new Map(c.items.map((it, i) => [it[7], i]));
      c.items.sort((a, b) => (rank.get(a[7]) ?? 1e6 + original.get(a[7])!) - (rank.get(b[7]) ?? 1e6 + original.get(b[7])!));
    }
  }
  if (ov.categoryOrder?.length) {
    const rank = new Map(ov.categoryOrder.map((s, i) => [s, i]));
    const original = new Map(cats.map((c, i) => [c.slug, i]));
    cats.sort((a, b) => (rank.get(a.slug) ?? 1e6 + original.get(a.slug)!) - (rank.get(b.slug) ?? 1e6 + original.get(b.slug)!));
  }

  const byId = new Map<string, { item: MenuItem; category: MenuCategory }>();
  for (const c of cats) for (const it of c.items) byId.set(it[7], { item: it, category: c });
  const subcategoryNames: Record<string, string> = {};
  for (const c of cats) for (const it of c.items) {
    const s = slugify(it[6]);
    subcategoryNames[s] = ov.subcategories?.[s]?.name ?? subcategoryNames[s] ?? it[6];
  }
  const categories = cats
    .filter((c) => !hiddenCategories.has(c.slug))
    .map((c) => ({ ...c, items: c.items.filter((it) => !hidden.has(it[7])) }))
    .filter((c) => c.items.length > 0);
  return { categories, all: cats, byId, hidden, hiddenCategories, subcategoryNames };
}

// ---------- validation ----------

const fail = (field: string, message: string): never => {
  throw new MetadataValidationError(field, message);
};
const UNSAFE = /[\u0000-\u001f\u007f<>]/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const NEW_ID = /^p-[a-z0-9]{6,16}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function str(v: unknown, field: string, max: number, min = 0): string {
  if (typeof v !== "string") fail(field, "Must be text");
  if (UNSAFE.test(v as string)) fail(field, "Angle brackets and control characters are not allowed");
  const s = (v as string).replace(/\s+/g, " ").trim();
  if (s.length < min) fail(field, min === 1 ? "Required" : `At least ${min} characters`);
  if (s.length > max) fail(field, `At most ${max} characters`);
  return s;
}

export function validatePrice(v: unknown, field = "price"): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(field, "Price must be a number (AED)");
  const n = v as number;
  if (n <= 0) fail(field, "Price must be more than 0");
  if (n > 10000) fail(field, "Price looks too high (over AED 10,000)");
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) fail(field, "At most 2 decimal places");
  return Math.round(n * 100) / 100;
}

function nutrition(v: unknown, key: NutritionKey, field: string): number | null {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) fail(field, `${NUTRITION_LABEL[key]}: enter a number, or leave it empty`);
  const n = v as number;
  if (n < 0) fail(field, `${NUTRITION_LABEL[key]} cannot be negative`);
  if (n > NUTRITION_MAX[key]) fail(field, `${NUTRITION_LABEL[key]} looks too high`);
  if (Math.abs(n * 10 - Math.round(n * 10)) > 1e-6) fail(field, `${NUTRITION_LABEL[key]}: at most 1 decimal place`);
  return Math.round(n * 10) / 10;
}

const PATCH_KEYS = new Set(["name", "description", "price", "category", "column", "ingredients", "image", "imageAlt", "tag", "size", "customize", ...NUTRITION, "hidden"]);

function validatePatch(raw: unknown, field: string, cats: Set<string>, isNew: boolean): ProductPatch {
  if (!isObj(raw)) fail(field, "Invalid product");
  const p = raw as Record<string, unknown>;
  for (const k of Object.keys(p)) if (!PATCH_KEYS.has(k) && !(isNew && k === "id")) fail(`${field}.${k}`, `Unknown product field "${k}"`);
  const out: ProductPatch = {};
  if (p.name !== undefined) out.name = str(p.name, `${field}.name`, 60, 1);
  if (p.description !== undefined) out.description = str(p.description, `${field}.description`, 200, 1);
  if (p.price !== undefined) out.price = validatePrice(p.price, `${field}.price`);
  if (p.category !== undefined) {
    if (typeof p.category !== "string" || !cats.has(p.category)) fail(`${field}.category`, "Choose an existing category");
    out.category = p.category as string;
  }
  if (p.column !== undefined) out.column = str(p.column, `${field}.column`, 30, 1);
  if (p.ingredients !== undefined) {
    if (!Array.isArray(p.ingredients) || p.ingredients.length > 25) fail(`${field}.ingredients`, "Up to 25 ingredients");
    out.ingredients = (p.ingredients as unknown[]).map((x, i) => str(x, `${field}.ingredients.${i}`, 100)).filter(Boolean);
  }
  if (p.image !== undefined) {
    if (!isLibraryImage(p.image)) fail(`${field}.image`, "Choose an image from the image library");
    out.image = p.image as string;
  }
  if (p.imageAlt !== undefined) out.imageAlt = str(p.imageAlt, `${field}.imageAlt`, 125);
  if (p.tag !== undefined) {
    if (!(TAGS as readonly unknown[]).includes(p.tag)) fail(`${field}.tag`, "Tag must be empty, V (vegetarian) or VG (vegan)");
    out.tag = p.tag as string;
  }
  if (p.size !== undefined) out.size = str(p.size, `${field}.size`, 24);
  if (p.customize !== undefined) {
    if (!(CUSTOMIZE as readonly unknown[]).includes(p.customize)) fail(`${field}.customize`, "Unknown customisation option");
    out.customize = p.customize as CustomizeChoice;
  }
  for (const k of NUTRITION) if (p[k] !== undefined) out[k] = nutrition(p[k], k, `${field}.${k}`);
  if (p.hidden !== undefined) {
    if (typeof p.hidden !== "boolean") fail(`${field}.hidden`, "Must be true or false");
    out.hidden = p.hidden as boolean;
  }
  return out;
}

/** Drops patch fields that equal the code values (only real overrides are stored). */
function minimise(p: ProductPatch, item: MenuItem): ProductPatch {
  const d = item[5];
  const out: ProductPatch = { ...p };
  const same: [keyof ProductPatch, unknown][] = [["name", item[0]], ["description", item[1]], ["price", item[2]], ["image", item[3]], ["tag", item[4]], ["column", item[6]], ["size", d.size ?? ""], ["imageAlt", d.imageAlt ?? ""], ["customize", d.customize ?? "auto"]];
  for (const [k, v] of same) if (out[k] !== undefined && out[k] === v) delete out[k];
  if (out.ingredients && JSON.stringify(out.ingredients) === JSON.stringify(d.ingredients ?? [])) delete out.ingredients;
  for (const k of NUTRITION) if (out[k] !== undefined && out[k] === parseNutrition(d[k])) delete out[k];
  if (out.hidden === false) delete out.hidden;
  return out;
}

/**
 * Validates menu overrides against the code menu. Rejects unknown products,
 * categories and fields, invalid prices and nutrition, and images outside the
 * library. Returns only real overrides.
 */
export function validateMenu(input: unknown, base: readonly MenuCategory[]): MenuOverrides {
  if (!isObj(input)) fail("menu", "Must be an object");
  const o = input as Record<string, unknown>;
  const KNOWN = new Set(["products", "added", "order", "categories", "addedCategories", "categoryOrder", "subcategories"]);
  for (const k of Object.keys(o)) if (!KNOWN.has(k)) fail(k, `Unknown menu section "${k}"`);
  const out: MenuOverrides = {};

  const baseIds = new Map<string, MenuItem>();
  for (const c of base) for (const it of c.items) baseIds.set(it[7], it);
  const cats = new Set(base.map((c) => c.slug));

  if (o.addedCategories !== undefined) {
    if (!Array.isArray(o.addedCategories) || o.addedCategories.length > 20) fail("addedCategories", "Up to 20 new categories");
    out.addedCategories = (o.addedCategories as unknown[]).map((raw, i) => {
      if (!isObj(raw)) fail(`addedCategories.${i}`, "Invalid category");
      const r = raw as Record<string, unknown>;
      for (const k of Object.keys(r)) if (!["slug", "name", "tagline"].includes(k)) fail(`addedCategories.${i}.${k}`, `Unknown field "${k}"`);
      if (typeof r.slug !== "string" || !SLUG.test(r.slug) || RESERVED_SLUGS.has(r.slug) || cats.has(r.slug)) fail(`addedCategories.${i}.slug`, "Use a new, unique slug: lowercase letters, numbers and dashes");
      cats.add(r.slug as string);
      return { slug: r.slug as string, name: str(r.name, `addedCategories.${i}.name`, 40, 1), tagline: str(r.tagline ?? "", `addedCategories.${i}.tagline`, 80) };
    });
  }

  const addedIds = new Set<string>();
  if (o.added !== undefined) {
    if (!Array.isArray(o.added) || o.added.length > 300) fail("added", "Up to 300 new products");
    out.added = (o.added as unknown[]).map((raw, i) => {
      const r = raw as Record<string, unknown>;
      if (!isObj(raw) || typeof r.id !== "string" || !NEW_ID.test(r.id) || baseIds.has(r.id) || addedIds.has(r.id)) fail(`added.${i}.id`, "Each new product needs a unique generated ID");
      addedIds.add(r.id as string);
      const p = validatePatch(raw, `added.${i}`, cats, true);
      for (const k of ["name", "description", "price", "category", "column", "image"] as const) if (p[k] === undefined) fail(`added.${i}.${k}`, `${k[0].toUpperCase()}${k.slice(1)} is required for a new product`);
      return { ...p, id: r.id as string } as NewProduct;
    });
  }

  if (o.products !== undefined) {
    if (!isObj(o.products)) fail("products", "Must be an object");
    const products: Record<string, ProductPatch> = {};
    for (const [id, raw] of Object.entries(o.products as Record<string, unknown>)) {
      const item = baseIds.get(id);
      if (!item && !addedIds.has(id)) fail(`products.${id}`, `Unknown product "${id}"`);
      const p = validatePatch(raw, `products.${id}`, cats, false);
      const m = item ? minimise(p, item) : p;
      if (Object.keys(m).length) products[id] = m;
    }
    if (Object.keys(products).length) out.products = products;
  }

  const allIds = new Set([...baseIds.keys(), ...addedIds]);
  if (o.order !== undefined) {
    if (!isObj(o.order)) fail("order", "Must be an object");
    const order: Record<string, string[]> = {};
    for (const [slug, ids] of Object.entries(o.order as Record<string, unknown>)) {
      if (!cats.has(slug)) fail(`order.${slug}`, `Unknown category "${slug}"`);
      if (!Array.isArray(ids) || ids.length > 400) fail(`order.${slug}`, "Must be a list of products");
      const seen = new Set<string>();
      for (const id of ids as unknown[]) {
        if (typeof id !== "string" || !allIds.has(id) || seen.has(id)) fail(`order.${slug}`, "The order lists an unknown or repeated product");
        seen.add(id as string);
      }
      if ((ids as string[]).length) order[slug] = ids as string[];
    }
    if (Object.keys(order).length) out.order = order;
  }

  if (o.categories !== undefined) {
    if (!isObj(o.categories)) fail("categories", "Must be an object");
    const categories: Record<string, CategoryPatch> = {};
    for (const [slug, raw] of Object.entries(o.categories as Record<string, unknown>)) {
      if (!cats.has(slug)) fail(`categories.${slug}`, `Unknown category "${slug}"`);
      if (!isObj(raw)) fail(`categories.${slug}`, "Invalid category");
      const r = raw as Record<string, unknown>;
      for (const k of Object.keys(r)) if (!["name", "tagline", "hidden"].includes(k)) fail(`categories.${slug}.${k}`, `Unknown field "${k}"`);
      const baseCat = base.find((c) => c.slug === slug);
      const cp: CategoryPatch = {};
      if (r.name !== undefined) {
        const n = str(r.name, `categories.${slug}.name`, 40, 1);
        if (n !== baseCat?.category) cp.name = n;
      }
      if (r.tagline !== undefined) {
        const t = str(r.tagline, `categories.${slug}.tagline`, 80);
        if (t !== baseCat?.tagline) cp.tagline = t;
      }
      if (r.hidden !== undefined) {
        if (typeof r.hidden !== "boolean") fail(`categories.${slug}.hidden`, "Must be true or false");
        if (r.hidden) cp.hidden = true;
      }
      if (Object.keys(cp).length) categories[slug] = cp;
    }
    if (Object.keys(categories).length) out.categories = categories;
  }

  if (o.categoryOrder !== undefined) {
    if (!Array.isArray(o.categoryOrder)) fail("categoryOrder", "Must be a list");
    const seen = new Set<string>();
    for (const s of o.categoryOrder as unknown[]) {
      if (typeof s !== "string" || !cats.has(s) || seen.has(s)) fail("categoryOrder", "The order lists an unknown or repeated category");
      seen.add(s as string);
    }
    if ((o.categoryOrder as string[]).length) out.categoryOrder = o.categoryOrder as string[];
  }

  if (o.subcategories !== undefined) {
    if (!isObj(o.subcategories)) fail("subcategories", "Must be an object");
    const columns = new Set<string>();
    const effective = buildEffectiveMenu(base, { ...out, subcategories: undefined });
    for (const c of effective.all) for (const it of c.items) columns.add(slugify(it[6]));
    const subcategories: Record<string, { name: string }> = {};
    for (const [slug, raw] of Object.entries(o.subcategories as Record<string, unknown>)) {
      if (!columns.has(slug)) fail(`subcategories.${slug}`, `Unknown subcategory "${slug}"`);
      if (!isObj(raw)) fail(`subcategories.${slug}`, "Invalid subcategory");
      const name = str((raw as Record<string, unknown>).name, `subcategories.${slug}.name`, 30, 1);
      const original = effective.subcategoryNames[slug];
      if (name !== original) subcategories[slug] = { name };
    }
    if (Object.keys(subcategories).length) out.subcategories = subcategories;
  }

  const effective = buildEffectiveMenu(base, out);
  if (!effective.categories.length) fail("menu", "At least one product must stay visible");
  if (JSON.stringify(out).length > 900_000) fail("menu", "The menu overrides are too large");
  return out;
}

// ---------- diff ----------

export interface MenuDiffRow {
  label: string;
  before: string;
  after: string;
}

function describe(item: MenuItem | undefined, cat: MenuCategory | undefined, hidden: boolean) {
  if (!item) return null;
  const d = item[5];
  return {
    Name: item[0],
    Description: item[1],
    Price: `AED ${item[2]}`,
    Photo: item[3],
    "Photo alt text": d.imageAlt ?? "",
    Tag: item[4],
    Category: cat?.category ?? "",
    Subcategory: item[6],
    Ingredients: (d.ingredients ?? []).join(", "),
    Size: d.size ?? "",
    Customisation: d.customize ?? "automatic",
    ...Object.fromEntries(NUTRITION.map((k) => [NUTRITION_LABEL[k], d[k] ?? ""])),
    Visibility: hidden ? "Hidden" : "Shown",
  } as Record<string, string>;
}

/** Field-by-field changes between two versions of the menu overrides. */
export function menuDiff(base: readonly MenuCategory[], before: MenuOverrides | null, after: MenuOverrides | null): MenuDiffRow[] {
  const a = buildEffectiveMenu(base, before);
  const b = buildEffectiveMenu(base, after);
  const rows: MenuDiffRow[] = [];
  const ids = new Set([...a.byId.keys(), ...b.byId.keys()]);
  for (const id of ids) {
    const x = a.byId.get(id);
    const y = b.byId.get(id);
    const dx = describe(x?.item, x?.category, a.hidden.has(id));
    const dy = describe(y?.item, y?.category, b.hidden.has(id));
    const name = y?.item[0] ?? x?.item[0] ?? id;
    if (!dx && dy) {
      rows.push({ label: `Menu · New product · ${name}`, before: "—", after: `AED ${y!.item[2]} · ${y!.category.category} › ${y!.item[6]}` });
      continue;
    }
    if (dx && dy) for (const k of Object.keys(dy)) if (dx[k] !== dy[k]) rows.push({ label: `Menu · ${name} · ${k}`, before: dx[k] || "—", after: dy[k] || "—" });
  }
  const catSlugs = new Set([...a.all.map((c) => c.slug), ...b.all.map((c) => c.slug)]);
  for (const slug of catSlugs) {
    const ca = a.all.find((c) => c.slug === slug);
    const cb = b.all.find((c) => c.slug === slug);
    if (!ca && cb) rows.push({ label: `Menu · New category`, before: "—", after: cb.category });
    if (ca && cb) {
      if (ca.category !== cb.category) rows.push({ label: `Menu · Category name`, before: ca.category, after: cb.category });
      if (ca.tagline !== cb.tagline) rows.push({ label: `Menu · ${cb.category} · Tagline`, before: ca.tagline || "—", after: cb.tagline || "—" });
      if (a.hiddenCategories.has(slug) !== b.hiddenCategories.has(slug)) rows.push({ label: `Menu · ${cb.category} · Visibility`, before: a.hiddenCategories.has(slug) ? "Hidden" : "Shown", after: b.hiddenCategories.has(slug) ? "Hidden" : "Shown" });
      const oa = ca.items.map((i) => i[7]).join();
      const ob = cb.items.map((i) => i[7]).join();
      if (oa !== ob && ca.items.length === cb.items.length) rows.push({ label: `Menu · ${cb.category} · Product order`, before: ca.items.map((i) => i[0]).join(", "), after: cb.items.map((i) => i[0]).join(", ") });
    }
  }
  const order = (m: EffectiveMenu) => m.all.map((c) => c.category).join(", ");
  if (a.all.map((c) => c.slug).join() !== b.all.map((c) => c.slug).join()) rows.push({ label: "Menu · Category order", before: order(a), after: order(b) });
  for (const s of new Set([...Object.keys(a.subcategoryNames), ...Object.keys(b.subcategoryNames)])) {
    if (a.subcategoryNames[s] && b.subcategoryNames[s] && a.subcategoryNames[s] !== b.subcategoryNames[s]) rows.push({ label: "Menu · Subcategory name", before: a.subcategoryNames[s], after: b.subcategoryNames[s] });
  }
  return rows;
}

/** A new product ID (stored with the product; never derived from its name). */
export function newProductId(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return `p-${s}`;
}
