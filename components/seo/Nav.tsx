"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function Nav({ pages }: { pages: { path: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const editing = pathname === "/admin/seo/pages" ? params.get("path") ?? pages[0]?.path : null;
  const here = (href: string) => (pathname.startsWith(href) ? "page" : undefined);
  return (
    <nav className="seo-nav" aria-label="SEO Studio">
      <Link href="/admin/seo" aria-current={pathname === "/admin/seo" ? "page" : undefined}>Overview</Link>
      <span className="nav-group">Pages</span>
      {pages.map((p) => (
        <Link key={p.path} href={`/admin/seo/pages?path=${encodeURIComponent(p.path)}`} aria-current={editing === p.path ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
      <span className="nav-group">Site</span>
      <Link href="/admin/seo/images" aria-current={here("/admin/seo/images")}>Images &amp; alt text</Link>
      <Link href="/admin/seo/business" aria-current={here("/admin/seo/business")}>Business info</Link>
      <Link href="/admin/seo/settings" aria-current={here("/admin/seo/settings")}>Settings</Link>
      <a href="/" target="_blank" rel="noreferrer">View website ↗</a>
    </nav>
  );
}
