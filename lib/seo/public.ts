import "server-only";
// The only SEO-dashboard code the public site runs: reading published
// metadata overrides for generateMetadata (and the sitemap).
//
// Failure policy — published metadata must never silently revert:
//  - No database configured → code defaults (nothing was ever published).
//  - Database configured but unreadable/slow:
//      during `next build` → code defaults, logged (the build must not fail);
//      at runtime (ISR regeneration) → throw, so Next keeps serving the last
//      successfully generated page — with the published metadata — and
//      retries on a later request.

import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client.ts";
import { metadataOverrides } from "./db/schema.ts";
import type { MetaOverride } from "./core/metadata.ts";

export const READ_TIMEOUT_MS = 2000;

function databaseConfigured(): boolean {
  if (process.env.DATABASE_URL) return true;
  // local development: only if the dashboard has already created its database
  return process.env.NODE_ENV !== "production" && existsSync(path.join(process.cwd(), ".data", "seo-pglite"));
}

export class MetadataUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Published SEO metadata could not be read (${cause instanceof Error ? cause.message : String(cause)}); keeping the last generated page`);
    this.name = "MetadataUnavailableError";
  }
}

/** Testable core of the policy above. */
export async function readOverrideResilient(
  load: () => Promise<MetaOverride | null>,
  opts: { isBuild: boolean; timeoutMs?: number },
): Promise<MetaOverride | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      load(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${opts.timeoutMs ?? READ_TIMEOUT_MS} ms`)), opts.timeoutMs ?? READ_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (opts.isBuild) {
      console.error("[seo] published metadata unreadable during build; using code defaults:", e instanceof Error ? e.message : e);
      return null;
    }
    throw new MetadataUnavailableError(e);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Published values of one SEO Studio document: a page path such as "/" (tags),
 * "@images" (alt text) or "@business" (structured data).
 */
export async function publishedDoc<T = Record<string, unknown>>(key: string): Promise<T | null> {
  if (!databaseConfigured()) return null;
  return readOverrideResilient(
    async () => {
      const db = await getDb();
      const [row] = await db.select({ fields: metadataOverrides.fields }).from(metadataOverrides).where(eq(metadataOverrides.path, key));
      return (row?.fields as MetaOverride | undefined) ?? null;
    },
    { isBuild: process.env.NEXT_PHASE === "phase-production-build" },
  ) as Promise<T | null>;
}

export function publishedOverride(pagePath: string): Promise<MetaOverride | null> {
  return publishedDoc<MetaOverride>(pagePath);
}
