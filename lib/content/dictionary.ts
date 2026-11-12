// The dictionary the public menu renders for one language: the language file,
// English menu text from the published menu, and the published overlay.
// Pure and small — used by the client LocaleProvider and by SEO Studio.

import type { MenuDictionary } from "../i18n/dictionary.ts";
import { DEFAULT_LOCALE } from "../i18n/locales.ts";
import type { EffectiveMenu } from "./menu.ts";

export interface ProductTranslation {
  name?: string;
  description?: string;
  ingredients?: string[];
}
export interface LocaleOverlay {
  products?: Record<string, ProductTranslation>;
  categories?: Record<string, string>;
  categoryTaglines?: Record<string, string>;
  subcategories?: Record<string, string>;
  customization?: Partial<Record<"beans" | "milk" | "syrup", Record<string, string>>>;
  ui?: Record<string, string>;
}
/** The dictionary the public menu uses for one language (see the header comment). */
export function effectiveDictionary(locale: string, base: MenuDictionary | null, menu: Pick<EffectiveMenu, "all" | "subcategoryNames">, overlay: LocaleOverlay | undefined): MenuDictionary {
  const d: MenuDictionary = {
    categories: { ...(base?.categories ?? {}) },
    categoryTaglines: { ...(base?.categoryTaglines ?? {}) },
    subcategories: { ...(base?.subcategories ?? {}) },
    products: Object.fromEntries(Object.entries(base?.products ?? {}).map(([k, v]) => [k, { ...v }])),
    customization: {
      beans: { ...(base?.customization.beans ?? {}) },
      milk: { ...(base?.customization.milk ?? {}) },
      syrup: { ...(base?.customization.syrup ?? {}) },
    },
    ui: { ...(base?.ui ?? {}) },
  };
  if (locale === DEFAULT_LOCALE) {
    for (const c of menu.all) {
      d.categories[c.slug] = c.category;
      d.categoryTaglines[c.slug] = c.tagline;
      for (const it of c.items) d.products[it[7]] = { name: it[0], description: it[1], ingredients: [...(it[5].ingredients ?? [])] };
    }
    for (const [k, v] of Object.entries(menu.subcategoryNames)) d.subcategories[k] = v;
  }
  if (overlay) {
    for (const [id, t] of Object.entries(overlay.products ?? {})) d.products[id] = { ...(d.products[id] ?? { name: "", description: "" }), ...t };
    Object.assign(d.categories, overlay.categories);
    Object.assign(d.categoryTaglines, overlay.categoryTaglines);
    Object.assign(d.subcategories, overlay.subcategories);
    for (const g of ["beans", "milk", "syrup"] as const) Object.assign(d.customization[g], overlay.customization?.[g]);
    Object.assign(d.ui, overlay.ui);
  }
  return d;
}

