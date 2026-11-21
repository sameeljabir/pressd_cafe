import Link from "next/link";
// Header and footer for the blog pages. Plain links (no client JS): the home
// page's sections are reached at /#menu, /#visit, /#about.

import { phoneDigits, visibleHours } from "@/lib/content/hours";
import type { BusinessInfo } from "@/lib/seo/core/business";

export function BlogHeader() {
  return (
    <header className="blog-header">
      <Link className="blog-logo" href="/" aria-label="PRESS'D home">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
        <img src="/assets/pressd-logo.webp" alt="PRESS'D Wellness Café" width={132} height={40} />
      </Link>
      <nav aria-label="Main navigation" className="blog-nav">
        <Link href="/#menu">Menu</Link>
        <Link href="/#visit">Visit</Link>
        <Link href="/#about">About</Link>
        <Link href="/blog" aria-current="page">Journal</Link>
      </nav>
    </header>
  );
}

export function BlogFooter({ business }: { business: BusinessInfo }) {
  const hours = visibleHours(business.openingHours);
  return (
    <div className="blog-footer-wrap">
      <footer className="blog-footer">
        <div>
          <p className="blog-footer-brand">PRESS&apos;D</p>
          <address>
            {business.addressLines.map((l) => <span key={l}>{l}<br /></span>)}
          </address>
        </div>
        <div>
          <p className="blog-footer-head">Opening hours</p>
          {new Set(hours.map((h) => h.hours)).size === 1 ? <p>Daily · {hours[0]?.hours}</p> : hours.map((h) => <p key={h.day}>{h.day} · {h.hours}</p>)}
        </div>
        <div>
          <p className="blog-footer-head">Contact</p>
          {business.telephone ? <p><a href={`tel:+${phoneDigits(business.telephone)}`}>{business.telephone}</a></p> : null}
          {business.email ? <p><a href={`mailto:${business.email}`}>{business.email}</a></p> : null}
          {business.instagram ? <p><a href={business.instagram} rel="noopener noreferrer" target="_blank">Instagram</a></p> : null}
        </div>
        <nav aria-label="Footer" className="blog-footer-links">
          <Link href="/">Home</Link>
          <Link href="/#menu">Menu</Link>
          <Link href="/#visit">Visit us</Link>
          <Link href="/blog">Journal</Link>
        </nav>
      </footer>
    </div>
  );
}
