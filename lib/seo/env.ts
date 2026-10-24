// Server-side configuration for the SEO dashboard. Values are read on demand
// (never at import time) and secrets are never returned to the client —
// `configStatus()` only reports whether each one is present and valid.

import { parseAllowlist } from "./core/permissions.ts";
import { parseSiteUrl } from "./core/url.ts";
import { mongoUriProblem } from "./db/mongo.ts";

export const CRAWLER_USER_AGENT = "Mozilla/5.0 (compatible; PRESSD-SEO-Audit/1.0; +https://www.pressdcafe.ae/)";

export function siteUrl(): URL {
  return parseSiteUrl(process.env.SEO_SITE_URL || "https://www.pressdcafe.ae");
}

export function allowlist() {
  return parseAllowlist(process.env.SEO_ADMIN_USERS);
}

export function googleOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function sessionSecret(): string | null {
  const s = process.env.SEO_SESSION_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

export function pageSpeedKey(): string | null {
  return process.env.PAGESPEED_INSIGHTS_API_KEY?.trim() || null;
}

export type ConfigCheck = { name: string; required: boolean; ok: boolean; note: string };

/** Presence/validity of each setting — never the values themselves. */
export function configStatus(): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  let siteNote = "";
  let siteOk = true;
  try {
    siteNote = siteUrl().origin + (process.env.SEO_SITE_URL ? "" : " (default)");
  } catch (e) {
    siteOk = false;
    siteNote = e instanceof Error ? e.message : "invalid";
  }
  checks.push({ name: "SEO_SITE_URL", required: false, ok: siteOk, note: siteNote });
  const mongo = mongoUriProblem(process.env.MONGODB_URI);
  checks.push({
    name: "MONGODB_URI",
    required: true,
    ok: !mongo,
    note: !mongo
      ? "set"
      : mongo !== "not set"
        ? `${mongo} — drafts and publishing are unavailable`
        : process.env.NODE_ENV === "production"
          ? "missing — drafts and publishing are unavailable"
          : "missing — using the local development database (.data/seo-mongo)",
  });
  const al = allowlist();
  const withPw = [...al.users.keys()].filter((e) => al.hashes.has(e)).length;
  const noPw = al.users.size - withPw;
  checks.push({
    name: "SEO_ADMIN_USERS",
    required: true,
    ok: withPw > 0 && al.errors.length === 0,
    note: al.users.size
      ? `${al.users.size} user(s), ${withPw} can sign in${noPw ? `; ${noPw} without a password hash` : ""}${al.errors.length ? `; ${al.errors.length} invalid entr${al.errors.length === 1 ? "y" : "ies"}` : ""}`
      : "no users — nobody can sign in",
  });
  checks.push({ name: "SEO_SESSION_SECRET", required: true, ok: !!sessionSecret(), note: sessionSecret() ? "set" : "missing or shorter than 32 characters" });
  return checks;
}
