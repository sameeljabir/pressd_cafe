import type { Metadata, Viewport } from "next";
import "./blog.css";
import { SITE_ORIGIN } from "@/lib/siteMetadata";

// Root layout for /blog. Separate from the home page's layout, whose body
// class locks the one-screen home view; same fonts and colours as the site.
const FONTS = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Playfair+Display:ital,wght@1,500&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = { themeColor: "#fbb019" };

export default function BlogRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={FONTS} rel="stylesheet" />
      </head>
      <body className="blog-view">{children}</body>
    </html>
  );
}
