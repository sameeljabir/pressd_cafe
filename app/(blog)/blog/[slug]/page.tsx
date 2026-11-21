import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/blog/ArticleView";
import { BlogFooter, BlogHeader } from "@/components/blog/BlogChrome";
import { PostCard } from "@/components/blog/PostCard";
import PreviewBanner from "@/components/PreviewBanner";
import { articleJsonLd, postUrl, safeJsonLd, type PublishedPost } from "@/lib/blog/post";
import { previewPostBySlug, publicPostBySlug, publicPosts } from "@/lib/blog/public";
import { isPreview } from "@/lib/content/load";
import { effectiveBusiness, type BusinessInfo } from "@/lib/seo/core/business";
import { publishedDoc } from "@/lib/seo/public";
import { SITE_ORIGIN } from "@/lib/siteMetadata";

// Published articles are cached and refreshed when something is published.
// The 5-minute revalidation is what lets a scheduled article appear on its own
// shortly after its publication time (no cron job needed).
export const revalidate = 300;

// No paths at build time: each article is rendered on its first visit, then cached (ISR).
export async function generateStaticParams() {
  return [];
}

const site = new URL(SITE_ORIGIN);
type Params = Promise<{ slug: string }>;

async function load(slug: string): Promise<{ post: PublishedPost | null; preview: boolean }> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return { post: null, preview: false };
  const preview = await isPreview();
  return { post: preview ? await previewPostBySlug(slug) : await publicPostBySlug(slug), preview };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { post, preview } = await load(slug);
  if (!post) return { title: "Article not found | PRESS'D", robots: { index: false, follow: true } };
  const s = post.seo;
  const title = s.title || `${post.title} | PRESS'D Journal`;
  const description = s.description || post.excerpt || undefined;
  const image = s.ogImage || post.coverImage;
  const url = postUrl(post, site);
  return {
    title,
    description,
    alternates: { canonical: s.canonical || url },
    // Draft previews are never indexable.
    robots: preview ? { index: false, follow: false, nocache: true } : { index: s.index, follow: s.follow },
    keywords: s.focusKeyword || s.secondaryKeywords.length ? [s.focusKeyword, ...s.secondaryKeywords].filter(Boolean) : undefined,
    authors: [{ name: post.author }],
    openGraph: {
      type: "article",
      url,
      title: s.ogTitle || s.title || post.title,
      description: s.ogDescription || description,
      siteName: "PRESS'D Wellness Café",
      publishedTime: post.publishDate || undefined,
      modifiedTime: post.updatedAt,
      authors: [post.author],
      section: post.category || undefined,
      tags: post.tags,
      images: image ? [{ url: image, alt: post.coverAlt || post.title }] : undefined,
    },
    twitter: {
      card: s.twitterCard,
      title: s.ogTitle || s.title || post.title,
      description: s.ogDescription || description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const { post, preview } = await load(slug);
  if (!post) notFound();
  const [others, business] = await Promise.all([publicPosts(), publishedDoc<Partial<BusinessInfo>>("@business")]);
  const biz = effectiveBusiness(business);
  const score = (p: PublishedPost) => (p.category && p.category === post.category ? 2 : 0) + p.tags.filter((t) => post.tags.includes(t)).length;
  const related = others.filter((p) => p.id !== post.id).map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.p);
  const url = postUrl(post, site);
  const share = [
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { name: "X", href: `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}` },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  ];
  return (
    <>
      <BlogHeader />
      <main className="blog-main blog-main-article" id="content">
        {!preview ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd(post, site, { name: biz.name, logo: "/assets/pressd-logo.webp" })) }} /> : null}
        <nav className="blog-crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span> <Link href="/blog">Journal</Link>
        </nav>
        <ArticleView post={post} siteHost={site.host} dateIso={post.publishDate || post.updatedAt} />
        <aside className="blog-share" aria-label="Share this article">
          <span>Share</span>
          {share.map((s) => <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer">{s.name}</a>)}
        </aside>
        <div className="blog-cta">
          <p>Hungry after reading? <Link href="/#menu">See the menu</Link> or <Link href="/#visit">plan your visit</Link> to PRESS&apos;D at Meydan Polo Residence.</p>
        </div>
        {related.length ? (
          <section className="blog-related" aria-labelledby="related-title">
            <h2 id="related-title">More from the journal</h2>
            <div className="blog-grid">{related.map((p) => <PostCard key={p.id} post={p} />)}</div>
          </section>
        ) : null}
        <p><Link className="blog-back" href="/blog">← Back to the journal</Link></p>
      </main>
      <BlogFooter business={biz} />
      {preview ? <PreviewBanner /> : null}
    </>
  );
}
