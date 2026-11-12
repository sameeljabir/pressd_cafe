"use client";

// Page content, business info and the menu as published from SEO Studio (or,
// in an authenticated preview, as drafted). Resolved on the server by
// lib/content/load.ts; without a provider, or with nothing published, every
// hook returns the code defaults — the site renders exactly as before.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { menu as CODE_MENU, type MenuCategory, type MenuItem } from "@/data/menu";
import { BUSINESS_DEFAULTS, type BusinessInfo } from "@/lib/seo/core/business";
import { resolveContent, type ContentSchema, type ListItem } from "@/lib/content/schema";
import type { SiteContent } from "@/lib/content/site";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { slugify } from "@/lib/slugify";

/** SiteContent with the menu always present (null on the wire = the code menu). */
export type ResolvedSiteContent = SiteContent & { menu: MenuCategory[]; subcategoryNames: Record<string, string> };

const CODE_SUBCATEGORIES = Object.fromEntries(CODE_MENU.flatMap((c) => c.items.map((i) => [slugify(i[6]), i[6]])));

const DEFAULT_CONTENT: ResolvedSiteContent = {
  pages: {},
  business: BUSINESS_DEFAULTS,
  menu: CODE_MENU,
  hiddenItems: [],
  subcategoryNames: CODE_SUBCATEGORIES,
  translations: {},
  preview: false,
};

interface MenuLookup {
  menu: MenuCategory[];
  /** Every product, visible or hidden (hidden ones only for carts saved earlier). */
  byId: Map<string, MenuItem>;
  isHidden: (id: string) => boolean;
}

const Ctx = createContext<{ content: ResolvedSiteContent; lookup: MenuLookup }>({ content: DEFAULT_CONTENT, lookup: makeLookup(DEFAULT_CONTENT) });

function makeLookup(c: ResolvedSiteContent): MenuLookup {
  const byId = new Map<string, MenuItem>();
  for (const cat of c.menu) for (const it of cat.items) byId.set(it[7], it);
  const hidden = new Set<string>();
  for (const it of c.hiddenItems) {
    if (!byId.has(it[7])) byId.set(it[7], it);
    hidden.add(it[7]);
  }
  return { menu: c.menu, byId, isHidden: (id) => hidden.has(id) };
}

export function SiteContentProvider({ content, children }: { content: SiteContent | null; children: ReactNode }) {
  const value = useMemo(() => {
    const c: ResolvedSiteContent = content
      ? { ...content, menu: content.menu ?? CODE_MENU, subcategoryNames: content.subcategoryNames ?? CODE_SUBCATEGORIES }
      : DEFAULT_CONTENT;
    return { content: c, lookup: makeLookup(c) };
  }, [content]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSiteContent = () => useContext(Ctx).content;
export const useBusiness = (): BusinessInfo => useContext(Ctx).content.business;
export const useMenuData = (): MenuLookup => useContext(Ctx).lookup;

export interface PageText {
  /** Text in the visitor's language, else English, else the code default. */
  t: (path: string) => string;
  /** The same text in English (for messages sent to the café). */
  en: (path: string) => string;
  shared: Record<string, unknown>;
  list: (field: string) => ListItem[];
}

/** Content of one page section (see lib/content/pages.ts), resolved for the current language. */
export function usePage(schema: ContentSchema): PageText {
  const { locale } = useLocale();
  const doc = useContext(Ctx).content.pages[schema.key as keyof SiteContent["pages"]];
  return useMemo(() => {
    const r = resolveContent(schema, doc, locale);
    const e = locale === "en" ? r : resolveContent(schema, doc, "en");
    return {
      t: (path) => r.text[path] ?? schema.defaults.text[path] ?? "",
      en: (path) => e.text[path] ?? schema.defaults.text[path] ?? "",
      shared: r.shared,
      list: (field) => (Array.isArray(r.shared[field]) ? (r.shared[field] as ListItem[]) : []),
    };
  }, [schema, doc, locale]);
}
