// Renders a validated article. Used by the public article page (server) and by
// the dashboard's live preview (client), so both show exactly the same markup.
// Only the allow-listed nodes of lib/blog/content.ts are rendered; text is
// output as React text (escaped) and links are re-checked with safeHref.

import type { ReactNode } from "react";
import { headingId, safeHref, type RichMark, type RichNode } from "@/lib/blog/content";
import { readTime, type BlogPost } from "@/lib/blog/post";

/** Only site images (library or uploads) are ever rendered, even in an unsaved preview. */
const siteImage = (src: unknown): src is string => typeof src === "string" && /^\/(assets|media)\/[^\s"'<>]+$/.test(src);

const DUBAI_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
export const formatPostDate = (iso: string) => (iso ? DUBAI_DATE.format(new Date(iso)) : "");

function withMarks(text: string, marks: RichMark[] | undefined, key: string, siteHost: string): ReactNode {
  let out: ReactNode = text;
  for (const m of marks ?? []) {
    if (m.type === "bold") out = <strong key={key}>{out}</strong>;
    else if (m.type === "italic") out = <em key={key}>{out}</em>;
    else if (m.type === "underline") out = <u key={key}>{out}</u>;
    else if (m.type === "link") {
      const href = safeHref(m.attrs?.href);
      if (!href) continue;
      let external = false;
      try {
        external = /^https?:/.test(href) && new URL(href).hostname.replace(/^www\./, "") !== siteHost.replace(/^www\./, "");
      } catch {
        external = false;
      }
      out = external ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{out}</a> : <a key={key} href={href}>{out}</a>;
    }
  }
  return out;
}

function inline(nodes: RichNode[] | undefined, siteHost: string, prefix: string): ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    const key = `${prefix}-${i}`;
    if (n.type === "hardBreak") return <br key={key} />;
    if (n.type === "text") return <span key={key}>{withMarks(n.text ?? "", n.marks, key, siteHost)}</span>;
    return null;
  });
}

const alignStyle = (n: RichNode) => (n.attrs?.textAlign ? { textAlign: n.attrs.textAlign as "center" | "right" | "justify" } : undefined);

function block(n: RichNode, key: string, ctx: { siteHost: string; ids: Map<string, number> }): ReactNode {
  const kids = () => (n.content ?? []).map((c, i) => block(c, `${key}-${i}`, ctx));
  switch (n.type) {
    case "paragraph":
      return <p key={key} style={alignStyle(n)}>{inline(n.content, ctx.siteHost, key)}</p>;
    case "heading": {
      const level = Math.min(6, Math.max(2, Number(n.attrs?.level ?? 2)));
      const text = (n.content ?? []).map((c) => c.text ?? "").join("");
      const Tag = `h${level}` as "h2";
      return <Tag key={key} id={headingId(text, ctx.ids)} style={alignStyle(n)}>{inline(n.content, ctx.siteHost, key)}</Tag>;
    }
    case "blockquote":
      return <blockquote key={key}>{kids()}</blockquote>;
    case "bulletList":
      return <ul key={key}>{kids()}</ul>;
    case "orderedList":
      return <ol key={key} start={typeof n.attrs?.start === "number" ? n.attrs.start : undefined}>{kids()}</ol>;
    case "listItem":
      return <li key={key}>{kids()}</li>;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = n.attrs?.src;
      if (!siteImage(src)) return null;
      const caption = n.attrs?.title ? String(n.attrs.title) : null;
      return (
        <figure key={key}>
          {/* eslint-disable-next-line @next/next/no-img-element -- validated library/upload path, lazy-loaded */}
          <img src={src} alt={String(n.attrs?.alt ?? "")} loading="lazy" decoding="async" />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    case "table": {
      const rows = n.content ?? [];
      const headRow = rows[0]?.content?.every((c) => c.type === "tableHeader") ? rows[0] : null;
      const body = headRow ? rows.slice(1) : rows;
      const cell = (c: RichNode, k: string) => {
        const props = { colSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined, rowSpan: Number(c.attrs?.rowspan ?? 1) > 1 ? Number(c.attrs?.rowspan) : undefined };
        const inner = (c.content ?? []).map((x, i) => block(x, `${k}-${i}`, ctx));
        return c.type === "tableHeader" ? <th key={k} scope="col" {...props}>{inner}</th> : <td key={k} {...props}>{inner}</td>;
      };
      return (
        <div key={key} className="blog-table">
          <table>
            {headRow ? <thead><tr>{(headRow.content ?? []).map((c, i) => cell(c, `${key}-h${i}`))}</tr></thead> : null}
            <tbody>{body.map((r, ri) => <tr key={`${key}-r${ri}`}>{(r.content ?? []).map((c, ci) => cell(c, `${key}-r${ri}-${ci}`))}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    default:
      return null;
  }
}

export function ArticleBody({ doc, siteHost }: { doc: RichNode; siteHost: string }) {
  const ctx = { siteHost, ids: new Map<string, number>() };
  return <div className="blog-body">{(doc.content ?? []).map((n, i) => block(n, `b${i}`, ctx))}</div>;
}

/** The article as it appears on /blog/[slug] (cover, H1, byline, body). */
export function ArticleView({ post, siteHost, dateIso }: { post: Pick<BlogPost, "title" | "excerpt" | "category" | "author" | "coverImage" | "coverAlt" | "content" | "tags">; siteHost: string; dateIso: string }) {
  const minutes = readTime(post);
  return (
    <article className="blog-article">
      <header className="blog-article-head">
        {post.category ? <p className="blog-eyebrow">{post.category}</p> : null}
        <h1>{post.title || "Untitled article"}</h1>
        {post.excerpt ? <p className="blog-lede">{post.excerpt}</p> : null}
        <p className="blog-byline">
          <span>By {post.author || "PRESS'D"}</span>
          {dateIso ? <><span aria-hidden="true">·</span><time dateTime={dateIso}>{formatPostDate(dateIso)}</time></> : null}
          <span aria-hidden="true">·</span>
          <span>{minutes} min read</span>
        </p>
      </header>
      {siteImage(post.coverImage) ? (
        <figure className="blog-cover">
          {/* eslint-disable-next-line @next/next/no-img-element -- validated library/upload path; above the fold */}
          <img src={post.coverImage} alt={post.coverAlt} fetchPriority="high" decoding="async" />
        </figure>
      ) : null}
      <ArticleBody doc={post.content} siteHost={siteHost} />
      {post.tags.length ? (
        <ul className="blog-tags" aria-label="Tags">
          {post.tags.map((t) => <li key={t}>{t}</li>)}
        </ul>
      ) : null}
    </article>
  );
}
