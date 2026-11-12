"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Page content editors (lib/content/pages.ts), in the order of the website.
const CONTENT_PAGES = [
  { href: "/admin/seo/content/hero", label: "Home" },
  { href: "/admin/seo/content/about", label: "About" },
  { href: "/admin/seo/content/visit", label: "Visit" },
  { href: "/admin/seo/content/navigation", label: "Navigation" },
  { href: "/admin/seo/content/footer", label: "Footer" },
  { href: "/admin/seo/content/booking", label: "Booking" },
];

export default function Nav({ pages }: { pages: { path: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const editing = pathname === "/admin/seo/pages" ? params.get("path") ?? pages[0]?.path : null;
  const here = (href: string) => (pathname.startsWith(href) ? "page" : undefined);
  return (
    <nav className="seo-nav" aria-label="SEO Studio">
      <Link href="/admin/seo" aria-current={pathname === "/admin/seo" ? "page" : undefined}>Overview</Link>
      <span className="nav-group">Pages</span>
      {CONTENT_PAGES.map((p) => (
        <Link key={p.href} href={p.href} aria-current={pathname.startsWith(p.href) ? "page" : undefined}>{p.label}</Link>
      ))}
      <span className="nav-group">Menu</span>
      <Link href="/admin/seo/menu" aria-current={here("/admin/seo/menu")}>Products &amp; categories</Link>
      <Link href="/admin/seo/translations" aria-current={here("/admin/seo/translations")}>Translations</Link>
      <span className="nav-group">SEO</span>
      {pages.map((p) => (
        <Link key={p.path} href={`/admin/seo/pages?path=${encodeURIComponent(p.path)}`} aria-current={editing === p.path ? "page" : undefined}>
          Google &amp; sharing
        </Link>
      ))}
      <Link href="/admin/seo/images" aria-current={here("/admin/seo/images")}>Images &amp; alt text</Link>
      <span className="nav-group">Site</span>
      <Link href="/admin/seo/library" aria-current={here("/admin/seo/library")}>Image library</Link>
      <Link href="/admin/seo/business" aria-current={here("/admin/seo/business")}>Business info</Link>
      <Link href="/admin/seo/settings" aria-current={here("/admin/seo/settings")}>Settings</Link>
      <a href="/" target="_blank" rel="noreferrer">View website ↗</a>
    </nav>
  );
}
