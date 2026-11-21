import type { Metadata } from "next";
import DbMissing from "@/components/seo/DbMissing";
import PageHead from "@/components/seo/PageHead";
import BlogEditor from "@/components/seo/blog/BlogEditor";
import { requirePage } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { emptyPost } from "@/lib/blog/post";
import { editorExtras } from "@/lib/blog/editorProps";

export const metadata: Metadata = { title: "New article" };

export default async function NewArticle() {
  const viewer = await requirePage("reports:read");
  if (!can(viewer.role, "content:draft"))
    return (<><PageHead eyebrow="Blogs & Articles" title="New article" /><div className="notice notice-error" role="alert"><p>Your role ({viewer.role}) can view articles but not create them.</p></div></>);
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Blogs & Articles" title="New article" /><DbMissing /></>);
  return (
    <>
      <PageHead eyebrow="Blogs & Articles" title="New article" />
      <BlogEditor id={null} initial={emptyPost()} draft={null} live={null} status="draft" canDraft canPublish={can(viewer.role, "content:publish")} {...await editorExtras(db)} />
    </>
  );
}
