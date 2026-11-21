import type { Metadata } from "next";
import PageHead from "@/components/seo/PageHead";
import { requirePage } from "@/lib/seo/auth/guard";
import { googleOAuthConfig } from "@/lib/seo/env";

export const metadata: Metadata = { title: "Analytics" };

// Status only. No Search Console or Analytics data is fetched by this dashboard,
// so no metrics are shown — nothing is estimated or filled with sample data.
export default async function AnalyticsPage() {
  await requirePage("reports:read");
  const oauth = !!googleOAuthConfig();
  const rows = [
    {
      name: "Google Search Console",
      metrics: "Organic clicks, impressions, CTR, average position, queries, top pages, devices, countries",
      state: oauth ? "Google OAuth credentials are set, but the Search Console module is not part of this dashboard." : "No Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).",
    },
    {
      name: "Google Analytics 4",
      metrics: "Organic traffic, users, sessions, conversion events, date ranges",
      state: "No GA4 property is connected, and the public site does not load a GA4 tag — so there is no data to read yet.",
    },
  ];
  return (
    <>
      <PageHead eyebrow="SEO" title="Analytics" lede="Search and traffic data from Google. Shown only once a real connection exists." />
      {rows.map((r) => (
        <section key={r.name} className="card">
          <div className="card-head">
            <h2 className="section">{r.name}</h2>
            <span className="tag tag-amber"><span className="dot dot-amber" aria-hidden="true" /> Not connected</span>
          </div>
          <p className="small">{r.state}</p>
          <p className="small faint">Once connected: {r.metrics}.</p>
        </section>
      ))}
      <section className="card">
        <h2 className="section">What connecting involves</h2>
        <ol className="small steps">
          <li>Tracking belongs on the deployment that serves www.pressdcafe.ae (this app, on Vercel).</li>
          <li>Search Console: verify the domain (a verification meta tag can be added under <a href="/admin/seo/pages?path=%2F&amp;tab=seo">Google &amp; sharing → Additional meta tags</a>, or by DNS), then grant a service account or OAuth client read access.</li>
          <li>GA4: create a property, add its tag to the public site (with a cookie-consent decision), and give the dashboard Data API read access.</li>
          <li>Credentials stay server-side as environment variables; they are never sent to the browser.</li>
        </ol>
        <p className="small faint">Until then, use Search Console and Analytics directly. The Technical audit lists what it can and cannot check without them.</p>
      </section>
    </>
  );
}
