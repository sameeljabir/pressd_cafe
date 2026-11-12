import type { Metadata } from "next";
import Link from "next/link";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import MenuManager from "@/components/seo/cms/MenuManager";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import type { MenuOverrides } from "@/lib/content/menu";
import { MENU_KEY } from "@/lib/seo/core/docs";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { historyRows } from "@/lib/seo/services/docs";
import { getDraft, getOverride } from "@/lib/seo/services/metadata";
import { codeDefaults } from "@/lib/seo/services/verify";

export const metadata: Metadata = { title: "Menu" };

const VIEWS = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
] as const;

export default async function MenuPage({ searchParams }: PageProps<"/admin/seo/menu">) {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Menu" title="Menu" /><DbMissing /></>);
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.id === sp.view) ?? VIEWS[0];
  const [published, draft, history] = await Promise.all([getOverride(db, MENU_KEY), getDraft(db, MENU_KEY), historyRows(db, MENU_KEY, codeDefaults())]);
  return (
    <>
      <PageHead
        eyebrow="Menu"
        title="Menu"
        lede="Products, prices, photos, nutrition and categories. Products are never deleted — hide them instead, so earlier orders and carts stay valid. Translations are on Menu translations."
      />
      <nav className="tabs" aria-label="Menu sections">
        {VIEWS.map((v) => (
          <Link key={v.id} href={v.id === "products" ? "/admin/seo/menu" : `/admin/seo/menu?view=${v.id}`} aria-current={v.id === view.id ? "page" : undefined}>{v.label}</Link>
        ))}
        <Link href="/admin/seo/translations">Translations</Link>
      </nav>
      <MenuManager
        key={`${draft?.savedAt.toISOString() ?? ""}:${published?.version ?? 0}`}
        view={view.id}
        published={(published?.fields as MenuOverrides | undefined) ?? null}
        draft={draft ? { fields: draft.fields as MenuOverrides, savedAt: draft.savedAt.toISOString(), savedBy: draft.savedBy } : null}
        canDraft={can(viewer.role, "content:draft")}
      />
      <HistoryPanel rows={history} canPublish={can(viewer.role, "content:publish")} title="Menu — publish history" />
    </>
  );
}
