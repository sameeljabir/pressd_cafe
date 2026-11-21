import type { Metadata } from "next";
import Link from "next/link";
import DbMissing from "@/components/seo/DbMissing";
import PageHead from "@/components/seo/PageHead";
import BlogManager, { type ListRow } from "@/components/seo/blog/BlogManager";
import { requirePage } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { getCategories, listPosts } from "@/lib/blog/service";

export const metadata: Metadata = { title: "Blogs & Articles" };

export default async function BlogsPage() {
  const viewer = await requirePage("reports:read");
  const db = await dbOrNull();
  if (!db) return (<><PageHead eyebrow="Content" title="Blogs & Articles" /><DbMissing /></>);
  const [posts, categories] = await Promise.all([listPosts(db), getCategories(db)]);
  const rows: ListRow[] = posts.map((p) => {
    const cur = p.draft ?? p.live!;
    return {
      id: p.id,
      title: cur.title,
      slug: cur.slug,
      category: cur.category,
      cover: cur.coverImage,
      status: p.status,
      pending: p.pending,
      hasLive: !!p.live,
      featured: cur.featured,
      publishDate: (p.live ?? cur).publishDate,
      createdAt: cur.createdAt,
      updatedAt: [p.draftSavedAt, p.livePublishedAt].filter(Boolean).sort().at(-1) ?? cur.createdAt,
    };
  });
  const canDraft = can(viewer.role, "content:draft");
  return (
    <>
      <PageHead
        eyebrow="Content"
        title="Blogs & Articles"
        lede="Write and manage articles for /blog. Saving keeps a private draft; an article appears on the website only after Confirm & Publish."
        actions={<>{canDraft ? <Link className="btn btn-primary" href="/admin/seo/blogs/new">+ New article</Link> : null}<a className="btn" href="/blog" target="_blank" rel="noreferrer">View /blog ↗</a></>}
      />
      <BlogManager rows={rows} categories={categories} canDraft={canDraft} canPublish={can(viewer.role, "content:publish")} />
    </>
  );
}
