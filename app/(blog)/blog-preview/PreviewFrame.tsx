"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArticleView } from "@/components/blog/ArticleView";
import { BlogHeader } from "@/components/blog/BlogChrome";
import type { BlogPost } from "@/lib/blog/post";

interface Msg {
  type: "pressd-blog-preview";
  post: BlogPost;
  siteHost: string;
}

export default function PreviewFrame() {
  const [data, setData] = useState<Msg | null>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // Only the dashboard page that embeds this frame (same origin) may drive it.
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as Msg | null;
      if (!m || m.type !== "pressd-blog-preview" || !m.post || typeof m.post !== "object") return;
      setData(m);
    };
    window.addEventListener("message", onMsg);
    if (window.parent !== window) window.parent.postMessage({ type: "pressd-blog-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  // Links inside the preview must not navigate the frame away.
  useEffect(() => {
    const stop = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("a")) e.preventDefault();
    };
    document.addEventListener("click", stop);
    return () => document.removeEventListener("click", stop);
  }, []);
  if (!data) return <main className="blog-main"><p className="blog-lede">Waiting for the editor…</p></main>;
  const p = data.post;
  return (
    <>
      <BlogHeader />
      <main className="blog-main blog-main-article">
        <nav className="blog-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> <span aria-hidden="true">/</span> <Link href="/blog">Journal</Link></nav>
        <ArticleView post={p} siteHost={data.siteHost} dateIso={p.publishDate || new Date().toISOString()} />
      </main>
    </>
  );
}
