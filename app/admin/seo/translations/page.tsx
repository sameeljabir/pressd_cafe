import type { Metadata } from "next";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import PageHead from "@/components/seo/PageHead";
import TranslationsEditor from "@/components/seo/cms/TranslationsEditor";
import { requirePage } from "@/lib/seo/auth/guard";
import { DICTIONARIES, ENGLISH } from "@/lib/content/dictionaries";
import { effectiveDictionary, translationStatus, type Translations } from "@/lib/content/translations";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_CODES } from "@/lib/i18n/locales";
import { effectiveMenuFor, TRANSLATIONS_KEY } from "@/lib/seo/core/docs";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { historyRows, menuContext } from "@/lib/seo/services/docs";
import { getDraft, getOverride } from "@/lib/seo/services/metadata";
import { codeDefaults } from "@/lib/seo/services/verify";

export const metadata: Metadata = { title: "Menu translations" };

export default async function TranslationsPage({ searchParams }: PageProps<"/admin/seo/translations">) {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Menu" title="Menu translations" /><DbMissing /></>);
  const sp = await searchParams;
  const lang = typeof sp.lang === "string" && isSupportedLocale(sp.lang) ? sp.lang : "it";
  const [published, draft, history, ctx] = await Promise.all([getOverride(db, TRANSLATIONS_KEY), getDraft(db, TRANSLATIONS_KEY), historyRows(db, TRANSLATIONS_KEY, codeDefaults()), menuContext(db)]);
  // Translations are checked against the menu being edited (its saved draft, else the live menu).
  const menu = effectiveMenuFor(ctx.menu);
  const current = ((draft ?? published)?.fields as Translations | undefined) ?? {};
  const english = effectiveDictionary(DEFAULT_LOCALE, ENGLISH, menu, current.en);
  const statuses = LOCALE_CODES.map((code) => {
    const st = translationStatus(code, DICTIONARIES[code], menu, current[code], english, ENGLISH);
    return { locale: code, percent: st.percent, missing: st.missing.length, outdated: st.outdated.map((o) => o.id), detail: st.missing };
  });
  const mine = statuses.find((s) => s.locale === lang)!;
  const totalMissing = statuses.filter((s) => s.locale !== DEFAULT_LOCALE).reduce((n, s) => n + s.missing, 0);
  return (
    <>
      <PageHead
        eyebrow="Menu"
        title="Menu translations"
        lede={`The menu in ${LOCALE_CODES.length} languages. Anything not translated shows in English on the website${totalMissing ? ` — ${totalMissing} items are missing a translation across all languages` : " — every language is complete"}.`}
      />
      <TranslationsEditor
        key={`${lang}:${draft?.savedAt.toISOString() ?? ""}:${published?.version ?? 0}`}
        locale={lang}
        base={DICTIONARIES[lang]}
        english={english}
        menu={menu.all.map((c) => ({ slug: c.slug, category: c.category, tagline: c.tagline, items: c.items.map((i) => ({ id: i[7], name: i[0], description: i[1], ingredients: i[5].ingredients ?? [] })) }))}
        subcategories={menu.subcategoryNames}
        published={(published?.fields as Translations | undefined) ?? null}
        draft={draft ? { fields: draft.fields as Translations, savedAt: draft.savedAt.toISOString(), savedBy: draft.savedBy } : null}
        statuses={statuses.map((s) => ({ locale: s.locale, percent: s.percent, missing: s.missing, outdated: s.outdated }))}
        missingKeys={mine.detail.map((m) => `${m.kind}:${m.key}`)}
        canDraft={can(viewer.role, "content:draft")}
      />
      <HistoryPanel rows={history} canPublish={can(viewer.role, "content:publish")} title="Translations — publish history" />
    </>
  );
}
