import "server-only";
import type { Db } from "../seo/db/mongo.ts";
import { getSettings } from "../seo/services/settings.ts";
import { listKeywords } from "../seo/services/keywords.ts";
import { siteUrl } from "../seo/env.ts";
import { allTags, getCategories } from "./service.ts";

/** Lists and settings the article editor needs besides the post itself. */
export async function editorExtras(db: Db) {
  const [settings, categories, tags, keywords] = await Promise.all([getSettings(db), getCategories(db), allTags(db), listKeywords(db)]);
  const seen = new Set<string>();
  return {
    thresholds: settings.thresholds,
    categories,
    tagSuggestions: tags,
    keywords: keywords.filter((k) => !seen.has(k.normalized) && seen.add(k.normalized)).map((k) => ({ keyword: k.keyword, type: k.type })),
    siteOrigin: siteUrl().origin,
  };
}
