import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import GlobalBar from "@/components/seo/GlobalBar";
import Nav from "@/components/seo/Nav";
import { currentViewer } from "@/lib/seo/auth/guard";
import { can } from "@/lib/seo/core/permissions";
import { siteUrl } from "@/lib/seo/env";
import { dbOrNull } from "@/lib/seo/db/mongo";
import { lastPublished, pendingChanges } from "@/lib/seo/services/docs";
import { PUBLIC_PAGES } from "@/lib/seo/services/metadata";
import { getSettings } from "@/lib/seo/services/settings";
import { codeDefaults } from "@/lib/seo/services/verify";

export default async function SeoLayout({ children }: LayoutProps<"/admin/seo">) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/admin/login");
  const db = await dbOrNull();
  const [pending, last] = db ? await Promise.all([getSettings(db).then((s) => pendingChanges(db, codeDefaults(), s.thresholds, siteUrl())), lastPublished(db)]) : [[], null];
  return (
    <div className="seo-shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="seo-side">
        <Link href="/admin/seo" className="seo-brand">
          PRESS&apos;D<small>SEO Studio</small>
        </Link>
        <Suspense fallback={null}>
          <Nav pages={PUBLIC_PAGES.map((p) => ({ path: p.path, label: p.label }))} />
        </Suspense>
        <div className="seo-user">
          <span>
            <b>{viewer.name ?? viewer.email}</b>
            <br />
            <span className="tag" title="Your permissions come from SEO_ADMIN_USERS">
              {viewer.role}
            </span>
          </span>
          <form action="/api/admin/auth/logout" method="post">
            <button className="btn btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="content" className="seo-main" tabIndex={-1}>
        {db ? <GlobalBar pendingCount={pending.length} lastPublished={last ? { at: last.at.toISOString(), by: last.by } : null} canPublish={can(viewer.role, "metadata:publish")} /> : null}
        {children}
      </main>
    </div>
  );
}
