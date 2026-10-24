import type { Metadata } from "next";
import Link from "next/link";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import ImagesEditor from "@/components/seo/ImagesEditor";
import LivePreview from "@/components/seo/LivePreview";
import PageHead from "@/components/seo/PageHead";
import SeoEditor from "@/components/seo/SeoEditor";
import { requirePage } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { siteUrl } from "@/lib/seo/env";
import { dbOrNull } from "@/lib/seo/page-data";
import { historyRows } from "@/lib/seo/services/docs";
import { getDraft, getOverride, PUBLIC_PAGES } from "@/lib/seo/services/metadata";
import { getSettings } from "@/lib/seo/services/settings";
import { codeDefaults } from "@/lib/seo/services/verify";
import { SITE_IMAGES, SITE_SECTIONS } from "@/lib/siteImages";

export const metadata: Metadata = { title: "Home page" };

// Existing landscape photos that work as share images (all in /public/assets).
const IMAGE_SUGGESTIONS = [
  { url: "/assets/our-cafe-cover.webp", label: "PRESS'D latte cup (current default)" },
  { url: "/assets/menu-cover.webp", label: "Menu spread" },
  { url: "/assets/menu-acai-bowl-cover.webp", label: "Açaí bowl" },
  { url: "/assets/cafe-interior-cover.webp", label: "Café interior" },
];

const TABS = [{ id: "seo", label: "Google & sharing", anchor: "" }, ...SITE_SECTIONS.filter((s) => SITE_IMAGES.some((i) => i.section === s.id))];

export default async function PagesEditor({ searchParams }: PageProps<"/admin/seo/pages">) {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Page" title="Home" /><DbMissing /></>);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab) ?? TABS[0];
  const page = PUBLIC_PAGES[0];
  const site = siteUrl();
  const canDraft = can(viewer.role, "metadata:draft");
  const canPublish = can(viewer.role, "metadata:publish");
  const href = (id: string) => `/admin/seo/pages?path=%2F&tab=${id}`;

  let body: React.ReactNode;
  if (tab.id === "seo") {
    const [published, draft, history, settings] = await Promise.all([getOverride(db, "/"), getDraft(db, "/"), historyRows(db, "/", codeDefaults()), getSettings(db)]);
    body = (
      <>
        <SeoEditor
          page={{ path: "/", url: new URL("/", site).toString(), label: page.label, note: page.note }}
          siteOrigin={site.origin}
          defaults={codeDefaults()}
          published={published ? { fields: published.fields, version: published.version, publishedBy: published.publishedBy, publishedAt: published.publishedAt.toISOString() } : null}
          draft={draft ? { fields: draft.fields, savedBy: draft.savedBy, savedAt: draft.savedAt.toISOString() } : null}
          thresholds={settings.thresholds}
          canDraft={canDraft}
          imageSuggestions={IMAGE_SUGGESTIONS}
        />
        <HistoryPanel rows={history} canPublish={canPublish} title="Google & sharing — publish history" />
      </>
    );
  } else {
    const [published, draft] = await Promise.all([getOverride(db, "@images"), getDraft(db, "@images")]);
    body = (
      <div className="split">
        <div>
          <p className="small muted" style={{ marginTop: 0 }}>Alt text describes each photo for Google Images and screen readers. The words on the page are kept in the code.</p>
          <ImagesEditor
            key={`${tab.id}:${draft?.savedAt.toISOString() ?? ""}:${published?.version ?? 0}`}
            sections={[tab.id as (typeof SITE_SECTIONS)[number]["id"]]}
            published={(published?.fields as Record<string, string> | undefined) ?? null}
            draft={(draft?.fields as Record<string, string> | undefined) ?? null}
            canDraft={canDraft}
          />
        </div>
        <LivePreview anchor={tab.anchor} />
      </div>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Page"
        title={page.label}
        lede={<>Address <a href="/" target="_blank" rel="noreferrer">{new URL("/", site).toString()}</a>. {page.note}</>}
        actions={<a className="btn btn-sm" href={`/${tab.anchor}`} target="_blank" rel="noreferrer">Open page ↗</a>}
      />
      <nav className="tabs" aria-label="Page sections">
        {TABS.map((t) => (
          <Link key={t.id} href={href(t.id)} aria-current={t.id === tab.id ? "page" : undefined} scroll={false}>{t.label}</Link>
        ))}
      </nav>
      {body}
    </>
  );
}
