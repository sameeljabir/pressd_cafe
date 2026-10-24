import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/seo/auth/guard";
import { allowlist, sessionSecret } from "@/lib/seo/env";

export const metadata: Metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  locked: "Too many failed attempts. Wait 15 minutes and try again.",
  not_configured: "Sign-in is not configured yet (SEO_SESSION_SECRET / SEO_ADMIN_USERS). See docs/seo-studio-setup.md.",
  database_unavailable: "The dashboard database is not available, so sign-in is disabled.",
  bad_origin: "The sign-in request was refused. Reload this page and try again.",
  signin_required: "Please sign in.",
};

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await currentViewer()) redirect("/admin/seo");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const al = allowlist();
  const configured = !!sessionSecret() && al.hashes.size > 0;
  return (
    <main className="login">
      <div className="login-card">
        <p className="eyebrow">PRESS&apos;D Wellness Café</p>
        <h1 className="page-title">SEO Studio</h1>
        <p className="muted" style={{ margin: "12px 0 24px" }}>Edit and publish the website&apos;s search and sharing tags.</p>
        {sp.signed_out ? <div className="notice notice-good" role="status"><p>You have been signed out.</p></div> : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            <p>{MESSAGES[error] ?? "Sign-in failed. Please try again."}</p>
          </div>
        ) : null}
        {configured ? (
          <form className="form-grid" style={{ gridTemplateColumns: "1fr" }} method="post" action="/api/admin/auth/login">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="username" required maxLength={320} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input className="input" id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
            </div>
            <button className="btn btn-primary" type="submit">Sign in</button>
          </form>
        ) : (
          <div className="notice" role="status">
            <h3>Setup required</h3>
            <p>Set SEO_SESSION_SECRET and SEO_ADMIN_USERS (with password hashes from <code>npm run seo:hash-password</code>), then redeploy. See docs/seo-studio-setup.md.</p>
          </div>
        )}
      </div>
    </main>
  );
}
