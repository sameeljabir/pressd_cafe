import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ContentEditor from "@/components/seo/cms/ContentEditor";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import { PAGE_SCHEMAS, pageSlug } from "@/lib/content/pages";
import type { ContentDoc } from "@/lib/content/schema";
import { effectiveAlts } from "@/lib/seo/core/images";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { historyRows } from "@/lib/seo/services/docs";
import { getDraft, getOverride } from "@/lib/seo/services/metadata";
import { codeDefaults } from "@/lib/seo/services/verify";

const TABS = [
  { id: "content", label: "Content" },
  { id: "images", label: "Images" },
  { id: "seo", label: "SEO & sharing" },
] as const;

const bySlug = (slug: string) => PAGE_SCHEMAS.find((s) => pageSlug(s.key) === slug);

export async function generateMetadata({ params }: PageProps<"/admin/seo/content/[page]">): Promise<Metadata> {
  return { title: bySlug((await params).page)?.label ?? "Page content" };
}

export default async function ContentPage({ params, searchParams }: PageProps<"/admin/seo/content/[page]">) {
  const viewer = await requirePage("reports:read");
  const schema = bySlug((await params).page);
  if (!schema) notFound();
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Page" title={schema.label} /><DbMissing /></>);
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab) ?? TABS[0];
  const [published, draft, history, images] = await Promise.all([getOverride(db, schema.key), getDraft(db, schema.key), historyRows(db, schema.key, codeDefaults()), getOverride(db, "@images")]);
  const canPublish = can(viewer.role, "content:publish");
  const href = (id: string) => `/admin/seo/content/${pageSlug(schema.key)}${id === "content" ? "" : `?tab=${id}`}`;
  return (
    <>
      <PageHead eyebrow="Page" title={schema.label} lede={schema.description} />
      <nav className="tabs" aria-label={`${schema.label} sections`}>
        {TABS.map((t) => (
          <Link key={t.id} href={href(t.id)} aria-current={t.id === tab.id ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      {tab.id === "seo" ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            The whole website is one address (pressdcafe.ae), so its Google title, description and share image are set once, on the Home page.
          </p>
          <div className="chip-row">
            <Link className="btn" href="/admin/seo/pages">Edit Google &amp; sharing</Link>
            <Link className="btn" href="/admin/seo/images">Edit alt text</Link>
            <Link className="btn" href="/admin/seo/business">Edit business info</Link>
          </div>
        </div>
      ) : (
        <ContentEditor
          key={`${tab.id}:${draft?.savedAt.toISOString() ?? ""}:${published?.version ?? 0}`}
          schemaKey={schema.key}
          tab={tab.id}
          published={(published?.fields as ContentDoc | undefined) ?? null}
          draft={draft ? { fields: draft.fields as ContentDoc, savedAt: draft.savedAt.toISOString(), savedBy: draft.savedBy } : null}
          canDraft={can(viewer.role, "content:draft")}
          alts={effectiveAlts((images?.fields as Record<string, string> | undefined) ?? null)}
        />
      )}
      <HistoryPanel rows={history} canPublish={canPublish} title={`${schema.label} — publish history`} />
    </>
  );
}
