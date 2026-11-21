import Link from "next/link";
import type { Metadata } from "next";
import { BlogFooter, BlogHeader } from "@/components/blog/BlogChrome";
import { PostCard } from "@/components/blog/PostCard";
import { categorySlug } from "@/lib/blog/post";
import { publicPosts } from "@/lib/blog/public";
import { effectiveBusiness, type BusinessInfo } from "@/lib/seo/core/business";
import { publishedDoc } from "@/lib/seo/public";
import { SITE_ORIGIN } from "@/lib/siteMetadata";

const PER_PAGE = 9;
const TITLE = "Journal | PRESS'D Wellness Café, Meydan Polo Residence";
const DESCRIPTION = "Stories, recipes and coffee notes from PRESS'D, the wellness café at Meydan Polo Residence, Dubai.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Filters and pages are views of the same list: one canonical URL.
  alternates: { canonical: "/blog" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/blog", type: "website", images: [{ url: "/assets/our-cafe-cover.webp", width: 1536, height: 1024 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/assets/our-cafe-cover.webp"] },
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BlogIndex({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [all, business] = await Promise.all([publicPosts(), publishedDoc<Partial<BusinessInfo>>("@business")]);
  const categories = [...new Map(all.filter((p) => p.category).map((p) => [categorySlug(p.category), p.category])).entries()];
  const cat = one(sp.category);
  const q = one(sp.q).trim().slice(0, 80);
  const needle = q.toLocaleLowerCase("en");
  const filtered = all.filter(
    (p) =>
      (!cat || categorySlug(p.category) === cat) &&
      (!needle || [p.title, p.excerpt, p.category, ...p.tags].join(" ").toLocaleLowerCase("en").includes(needle)),
  );
  const featured = !cat && !q ? (all.find((p) => p.featured) ?? null) : null;
  const rest = featured ? filtered.filter((p) => p.id !== featured.id) : filtered;
  const pages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(one(sp.page), 10) || 1));
  const shown = rest.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const link = (o: { category?: string; page?: number }) => {
    const u = new URLSearchParams();
    if (o.category ?? cat) u.set("category", (o.category ?? cat)!);
    if (q) u.set("q", q);
    if (o.page && o.page > 1) u.set("page", String(o.page));
    const s = u.toString();
    return `/blog${s ? `?${s}` : ""}`;
  };

  const ld = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "PRESS'D Journal",
    url: `${SITE_ORIGIN}/blog`,
    blogPost: all.slice(0, 20).map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${SITE_ORIGIN}/blog/${p.slug}`, datePublished: p.publishDate })),
  };

  return (
    <>
      <BlogHeader />
      <main className="blog-main" id="content">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
        <header className="blog-hero">
          <p className="blog-eyebrow">PRESS&apos;D · Journal</p>
          <h1>Good food, <em>good stories.</em></h1>
          <p className="blog-lede">Recipes, coffee notes and news from the café at Meydan Polo Residence.</p>
        </header>

        {all.length ? (
          <form className="blog-filters" action="/blog" method="get" role="search">
            <label className="sr-only" htmlFor="blog-q">Search articles</label>
            <input id="blog-q" name="q" type="search" defaultValue={q} placeholder="Search articles" />
            {cat ? <input type="hidden" name="category" value={cat} /> : null}
            <button type="submit">Search</button>
            {categories.length > 1 ? (
              <nav aria-label="Categories" className="blog-cats">
                <a href={q ? `/blog?q=${encodeURIComponent(q)}` : "/blog"} aria-current={!cat ? "page" : undefined}>All</a>
                {categories.map(([slug, name]) => <a key={slug} href={link({ category: slug, page: 1 })} aria-current={cat === slug ? "page" : undefined}>{name}</a>)}
              </nav>
            ) : null}
          </form>
        ) : null}

        {featured ? (
          <section aria-label="Featured article" className="blog-featured">
            <PostCard post={featured} large />
          </section>
        ) : null}

        {shown.length ? (
          <section aria-label="Articles" className="blog-grid">
            {shown.map((p) => <PostCard key={p.id} post={p} />)}
          </section>
        ) : !featured ? (
          <p className="blog-empty">{all.length ? "No articles match. " : "The first articles are on their way. "}<Link href="/blog">See all articles</Link> or <Link href="/#menu">browse the menu</Link>.</p>
        ) : null}

        {pages > 1 ? (
          <nav className="blog-pager" aria-label="Pages">
            {page > 1 ? <a href={link({ page: page - 1 })} rel="prev">← Newer</a> : <span />}
            <span>Page {page} of {pages}</span>
            {page < pages ? <a href={link({ page: page + 1 })} rel="next">Older →</a> : <span />}
          </nav>
        ) : null}
      </main>
      <BlogFooter business={effectiveBusiness(business)} />
    </>
  );
}
