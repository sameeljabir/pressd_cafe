import type { Metadata, Viewport } from "next";
import "../globals.css";
import { siteMetadata } from "@/lib/siteMetadata";
import { applyOverride } from "@/lib/seo/core/metadata";
import { publishedDoc, publishedOverride } from "@/lib/seo/public";
import { jsonLdScript, type BusinessInfo } from "@/lib/seo/core/business";

// Phase 1: loaded exactly as the original site did (same Google Fonts URL,
// same weights/styles), so text renders identically. Switching this to
// next/font/google is a safe, purely-technical follow-up for Phase 2 — it
// requires rewriting every literal "DM Sans" / Manrope / "Playfair Display"
// reference in globals.css to a CSS variable, which is out of scope for a
// 1:1 visual migration.
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Playfair+Display:ital,wght@1,500&display=swap";

// Fallback glyph coverage for the multilingual Menu (Arabic, Devanagari,
// Malayalam, Simplified Chinese, Japanese, Korean). Google Fonts serves each
// family as per-script @font-face blocks with unicode-range, so the browser
// only downloads a file when that script's characters actually appear on the
// page — negligible cost for the default English visitor.
const NOTO_FALLBACK_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans+Malayalam:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+KR:wght@400;700&display=swap";

// Defaults live in lib/siteMetadata.ts; metadata published from the SEO
// dashboard (/admin/seo/pages) is layered on top. With nothing published the
// output is identical to the defaults.
// Structured data: lib/seo/core/business.ts holds the defaults; Business Info
// published from the SEO dashboard is layered on top.
export async function generateMetadata(): Promise<Metadata> {
  return applyOverride(siteMetadata, await publishedOverride("/"));
}

export const viewport: Viewport = {
  themeColor: "#fbb019",
};


export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
        <link href={NOTO_FALLBACK_FONTS_HREF} rel="stylesheet" />
        {/* "PRESSD Editorial" italic (globals.css) — Home card labels. */}
        <link
          rel="preload"
          href="/fonts/playfair-display-italic-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/assets/pressd-hero-cinematic.mp4?v=2"
          as="video"
          type="video/mp4"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(await publishedDoc<Partial<BusinessInfo>>("@business")) }}
        />
      </head>
      <body className="home-view">{children}</body>
    </html>
  );
}
