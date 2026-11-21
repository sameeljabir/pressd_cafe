import "server-only";
// Runs the technical audit (core/siteAudit.ts) against real responses and keeps
// the last runs in seo_audits. Fetch targets are fixed — the configured site
// domain (checked by the SSRF guard) or this deployment's own origin — never a
// URL from the request body.

import { lookup } from "node:dns/promises";
import { ObjectId } from "mongodb";
import type { AuditDoc, Db } from "../db/mongo.ts";
import { assertSafeTarget } from "../core/net-guard.ts";
import { extractPageFacts } from "../core/html.ts";
import { NOT_CHECKED, healthScore, runChecks, type Check, type Fetched, type HostVariant, type LinkResult, type NotChecked } from "../core/siteAudit.ts";
import { effectiveBusiness, type BusinessInfo } from "../core/business.ts";
import { CRAWLER_USER_AGENT, siteUrl } from "../env.ts";
import { getOverride } from "./metadata.ts";
import { getSettings } from "./settings.ts";

export type AuditTarget = "live" | "app";
export const KEEP_RUNS = 20;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
const MAX_LINK_CHECKS = 40;

export class AuditTargetError extends Error {}

const dnsLookup = (h: string) => lookup(h, { all: true });

/** Hosts this deployment may audit itself on (local dev or the Vercel URLs of this project). */
function selfHostAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (process.env.NODE_ENV !== "production" && (h === "localhost" || h === "127.0.0.1")) return true;
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((v) => v!.toLowerCase());
  return vercel.includes(h) || h === siteUrl().hostname;
}

export function auditOrigin(target: AuditTarget, requestOrigin: string): string {
  if (target === "live") return siteUrl().origin;
  const u = new URL(requestOrigin);
  if (!selfHostAllowed(u.host)) throw new AuditTargetError(`This deployment (${u.host}) is not an approved audit target.`);
  return u.origin;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function get(url: string, opts: { follow: boolean; readBody: boolean; guard: string[] | null }): Promise<Fetched> {
  const t0 = Date.now();
  const redirects: Fetched["redirects"] = [];
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    try {
      if (opts.guard) await assertSafeTarget(new URL(current), opts.guard, dnsLookup);
      const res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": CRAWLER_USER_AGENT, accept: "text/html,application/xml,text/plain;q=0.9,*/*;q=0.5" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
      const loc = res.headers.get("location");
      if (opts.follow && res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current).toString();
        redirects.push({ from: current, to: next, status: res.status });
        await res.body?.cancel();
        current = next;
        continue;
      }
      const body = opts.readBody && res.status < 400 ? await readCapped(res) : (await res.body?.cancel(), null);
      return { url, status: res.status, finalUrl: current, redirects, body, headers, ms: Date.now() - t0 };
    } catch (e) {
      return { url, status: null, finalUrl: current, redirects, body: null, headers: {}, ms: Date.now() - t0, error: e instanceof Error ? (e.name === "TimeoutError" ? "timed out" : e.message.slice(0, 160)) : "failed" };
    }
  }
  return { url, status: null, finalUrl: current, redirects, body: null, headers: {}, ms: Date.now() - t0, error: "too many redirects" };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

/** Same-origin links and images of the page (no #fragment-only links, no admin/api URLs). */
export function internalUrls(html: string, pageUrl: string): { url: string; kind: "page" | "image" }[] {
  const facts = extractPageFacts(html);
  const base = new URL(pageUrl);
  const seen = new Set<string>();
  const out: { url: string; kind: "page" | "image" }[] = [];
  const push = (raw: string, kind: "page" | "image") => {
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript|data|sms|whatsapp):/i.test(raw)) return;
    let u: URL;
    try { u = new URL(raw, base); } catch { return; }
    if (u.origin !== base.origin || /^\/(admin|api)(\/|$)/.test(u.pathname) || u.pathname.startsWith("/_next/image")) return;
    u.hash = "";
    const key = u.toString();
    if (seen.has(key) || key === base.toString()) return;
    seen.add(key);
    out.push({ url: key, kind });
  };
  facts.links.forEach((l) => push(l.href, "page"));
  facts.images.forEach((i) => push(i.src, "image"));
  return out.slice(0, MAX_LINK_CHECKS);
}

export interface AuditRun {
  id: string;
  target: AuditTarget;
  url: string;
  ranBy: string;
  ranAt: string;
  durationMs: number;
  score: number | null;
  checks: Check[];
  notChecked: NotChecked[];
}

export function toRun(d: AuditDoc): AuditRun {
  return { id: d._id.toHexString(), target: d.target, url: d.url, ranBy: d.ranBy, ranAt: d.ranAt.toISOString(), durationMs: d.durationMs, score: d.score, checks: d.checks as Check[], notChecked: d.notChecked as NotChecked[] };
}

export async function runSiteAudit(db: Db, target: AuditTarget, requestOrigin: string, actor: string): Promise<AuditRun> {
  const t0 = Date.now();
  const origin = auditOrigin(target, requestOrigin);
  const site = siteUrl();
  const guard = target === "live" ? [site.hostname, site.hostname.replace(/^www\./, "")] : null;
  const [settings, business] = await Promise.all([getSettings(db), getOverride(db, "@business")]);

  const [page, robots, sitemap] = await Promise.all([
    get(`${origin}/`, { follow: true, readBody: true, guard }),
    get(`${origin}/robots.txt`, { follow: true, readBody: true, guard }),
    get(`${origin}/sitemap.xml`, { follow: true, readBody: true, guard }),
  ]);

  let links: LinkResult[] = [];
  if (page.status === 200 && page.body) {
    links = await pool(internalUrls(page.body, page.finalUrl), 6, async (l) => {
      const r = await get(l.url, { follow: false, readBody: false, guard });
      return { url: l.url, kind: l.kind, status: r.status, error: r.error };
    });
  }

  // http → https and apex ↔ www: only meaningful on the real domain.
  let hostVariants: HostVariant[] = [];
  if (target === "live") {
    const other = site.hostname.startsWith("www.") ? site.hostname.slice(4) : `www.${site.hostname}`;
    const variants = [`http://${site.hostname}/`, `https://${other}/`];
    hostVariants = await Promise.all(variants.map(async (v) => {
      // the guard only accepts https: check the host's DNS via its https form, then request the variant itself
      try {
        await assertSafeTarget(new URL(v.replace(/^http:/, "https:")), guard!, dnsLookup);
      } catch (e) {
        return { url: v, status: null, location: null, error: e instanceof Error ? e.message : "blocked" };
      }
      const r = await get(v, { follow: false, readBody: false, guard: null });
      return { url: v, status: r.status, location: r.headers.location ?? null, error: r.error };
    }));
  }

  const checks = runChecks({
    page, robots, sitemap, links, hostVariants,
    siteOrigin: site.origin,
    thresholds: settings.thresholds,
    business: effectiveBusiness((business?.fields as Partial<BusinessInfo> | undefined) ?? null),
  });
  const doc: AuditDoc = {
    _id: new ObjectId(),
    target,
    url: `${origin}/`,
    ranBy: actor,
    ranAt: new Date(),
    durationMs: Date.now() - t0,
    score: healthScore(checks),
    checks,
    notChecked: NOT_CHECKED,
  };
  await db.audits.insertOne(doc);
  // keep the most recent runs per target
  const old = await db.audits.find({ target }, { sort: { ranAt: -1 }, skip: KEEP_RUNS, projection: { _id: 1 } }).toArray();
  if (old.length) await db.audits.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  return toRun(doc);
}

export async function latestAudit(db: Db, target: AuditTarget): Promise<AuditRun | null> {
  const d = await db.audits.findOne({ target }, { sort: { ranAt: -1 } });
  return d ? toRun(d) : null;
}

export async function auditHistory(db: Db, target: AuditTarget, limit = KEEP_RUNS) {
  const rows = await db.audits.find({ target }, { sort: { ranAt: -1 }, limit, projection: { checks: 0, notChecked: 0 } }).toArray();
  return rows.map((r) => ({ id: r._id.toHexString(), ranAt: r.ranAt.toISOString(), ranBy: r.ranBy, score: r.score, url: r.url }));
}
