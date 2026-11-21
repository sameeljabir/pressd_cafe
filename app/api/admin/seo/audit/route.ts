import { BadRequest, handle, ok, readJson } from "@/lib/seo/api";
import { jsonError } from "@/lib/seo/auth/guard";
import { getDb } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { AuditTargetError, latestAudit, runSiteAudit, type AuditTarget } from "@/lib/seo/services/siteAudit";

const isTarget = (t: unknown): t is AuditTarget => t === "live" || t === "app";

// Latest stored result for a target.
export const GET = handle("reports:read", async (req) => {
  const target = new URL(req.url).searchParams.get("target") ?? "live";
  if (!isTarget(target)) throw new BadRequest("target must be live or app");
  return ok({ run: await latestAudit(await getDb(), target) });
});

// Run SEO Audit: fetches the target's home page, robots.txt, sitemap and internal links now.
export const POST = handle("audit:run", async (req, viewer) => {
  const { target } = await readJson(req, 1_000);
  if (!isTarget(target)) throw new BadRequest("target must be live or app");
  const db = await getDb();
  try {
    const run = await runSiteAudit(db, target, new URL(req.url).origin, viewer.email);
    await logAdmin(db, viewer.email, "audit_run", target, { score: run.score });
    return ok({ run }, 201);
  } catch (e) {
    if (e instanceof AuditTargetError) return jsonError(400, "invalid", e.message);
    throw e;
  }
});

// Audits fetch several URLs; allow longer than the default function time.
export const maxDuration = 60;
