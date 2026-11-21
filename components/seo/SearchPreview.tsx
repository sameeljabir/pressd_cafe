"use client";

import { useState } from "react";

interface Props {
  url: string;
  siteName: string;
  title: string;
  description: string;
  snippet: { title: string; description: string; titleTruncated: boolean; descriptionTruncated: boolean };
}

/** Breadcrumb-style URL as Google prints it: host › path segments. */
function crumbs(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return [u.origin, ...parts].join(" › ");
  } catch {
    return url;
  }
}

/**
 * Search result simulation (desktop and mobile). Updates as the form changes.
 * Truncation is a character approximation: Google cuts by pixel width and may
 * rewrite the title or description entirely.
 */
export default function SearchPreview({ url, siteName, title, description, snippet }: Props) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const mobile = mode === "mobile";
  // Mobile results wrap the title over more lines and show a slightly longer description.
  const t = mobile ? (title.length > 78 ? title.slice(0, 75).trimEnd() + "…" : title) : snippet.title;
  const d = mobile ? (description.length > 120 ? description.slice(0, 117).trimEnd() + "…" : description) : snippet.description;
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="section">Google preview</h2>
        <span className="seg" role="group" aria-label="Search preview device">
          {(["desktop", "mobile"] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </span>
      </div>
      <div className={`snippet ${mobile ? "snippet-mobile" : ""}`} aria-label={`Search result preview (${mode})`}>
        <div className="s-site">
          {/* eslint-disable-next-line @next/next/no-img-element -- the site's own favicon, shown as-is */}
          <img className="s-fav" src="/icon.png" alt="" width={18} height={18} />
          <span><b>{siteName}</b><br /><span className="s-url">{crumbs(url)}</span></span>
        </div>
        <div className="s-title">{t || <span className="faint">(no title)</span>}</div>
        <div className="s-desc">{d || <span className="faint">(no description — Google will pick text from the page)</span>}</div>
      </div>
      <p className="small faint">
        Simulation only. Google may rewrite titles and descriptions, and truncates by pixel width.
        {!mobile && (snippet.titleTruncated || snippet.descriptionTruncated) ? " Likely shortened on desktop: " + [snippet.titleTruncated ? "title" : "", snippet.descriptionTruncated ? "description" : ""].filter(Boolean).join(" and ") + "." : ""}
      </p>
    </section>
  );
}
