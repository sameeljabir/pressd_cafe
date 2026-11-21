import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DbMissing from "@/components/seo/DbMissing";
import HistoryPanel from "@/components/seo/HistoryPanel";
import PageHead from "@/components/seo/PageHead";
import BlogEditor from "@/components/seo/blog/BlogEditor";
import { requirePage } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { historyRows } from "@/lib/seo/services/docs";
import { codeDefaults } from "@/lib/seo/services/verify";
import { blogKey, emptyPost, publicStatus, type BlogPost } from "@/lib/blog/post";
import { getPost } from "@/lib/blog/service";
import { editorExtras } from "@/lib/blog/editorProps";

export const metadata: Metadata = { title: "Edit article" };

export default async function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Blogs & Articles" title="Edit article" /><DbMissing /></>);
  const { id } = await params;
  const post = await getPost(db, id);
  if (!post) notFound();
  const live = (post.live?.fields as BlogPost | undefined) ?? null;
  const current = { ...emptyPost(), ...((post.draft?.fields ?? post.live!.fields) as BlogPost) };
  const [extras, history] = await Promise.all([editorExtras(db), historyRows(db, blogKey(id), codeDefaults())]);
  return (
    <>
      <PageHead eyebrow="Blogs & Articles" title={current.title || "Untitled article"} />
      <BlogEditor
        key={`${post.draft?.savedAt.toISOString() ?? ""}:${post.live?.version ?? 0}`}
        id={id}
        initial={current}
        draft={post.draft ? { savedBy: post.draft.savedBy, savedAt: post.draft.savedAt.toISOString() } : null}
        live={post.live && live ? { version: post.live.version, publishedAt: post.live.publishedAt.toISOString(), publishedBy: post.live.publishedBy, slug: live.slug } : null}
        status={publicStatus(live)}
        canDraft={can(viewer.role, "content:draft")}
        canPublish={can(viewer.role, "content:publish")}
        {...extras}
      />
      <HistoryPanel rows={history} canPublish={can(viewer.role, "content:publish")} title="Publish history" />
    </>
  );
}
