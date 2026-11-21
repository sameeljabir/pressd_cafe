import Link from "next/link";
import { BlogHeader } from "@/components/blog/BlogChrome";

export default function NotFound() {
  return (
    <>
      <BlogHeader />
      <main className="blog-main blog-notfound" id="content">
        <p className="blog-eyebrow">404</p>
        <h1>This article isn&apos;t here.</h1>
        <p className="blog-lede">It may have moved or been unpublished. <Link href="/blog">Browse the journal</Link> or go <Link href="/">home</Link>.</p>
      </main>
    </>
  );
}
