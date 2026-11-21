import { formatPostDate } from "./ArticleView";
import type { PublishedPost } from "@/lib/blog/post";

export function PostCard({ post, large = false }: { post: PublishedPost; large?: boolean }) {
  const href = `/blog/${post.slug}`;
  return (
    <article className={`blog-card${large ? " blog-card-large" : ""}`}>
      <a href={href} className="blog-card-media" tabIndex={-1} aria-hidden="true">
        {post.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- validated library/upload path
          <img src={post.coverImage} alt="" loading={large ? "eager" : "lazy"} decoding="async" />
        ) : <span className="blog-card-noimg">PRESS&apos;D</span>}
      </a>
      <div className="blog-card-body">
        <p className="blog-card-meta">
          {post.category ? <span className="blog-chip">{post.category}</span> : null}
          <time dateTime={post.publishDate}>{formatPostDate(post.publishDate)}</time>
        </p>
        <h2 className="blog-card-title"><a href={href}>{post.title}</a></h2>
        {post.excerpt ? <p className="blog-card-excerpt">{post.excerpt}</p> : null}
        <a href={href} className="blog-more" aria-label={`Read more: ${post.title}`}>Read more →</a>
      </div>
    </article>
  );
}
