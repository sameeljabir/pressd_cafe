// Publishing metadata overrides, with full before/after history for restore.

import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { metadataChanges, metadataDrafts, metadataOverrides } from "../db/schema.ts";
import type { MetaOverride } from "../core/metadata.ts";
import type { PageFacts } from "../core/html.ts";

/** Public routes that exist in the app (source of truth: app/(site)). */
export const PUBLIC_PAGES = [
  {
    path: "/",
    label: "Home",
    type: "Home — single-page site",
    source: "app/(site)/layout.tsx (metadata) · app/(site)/page.tsx",
    editable: true,
    note: "This is the only public URL. About, Menu, Visit and the other sections are parts of this page (#anchors), so they share its tags.",
  },
] as const;

export function isEditablePath(path: string) {
  return PUBLIC_PAGES.some((p) => p.path === path && p.editable);
}

export async function getOverride(db: Db, path: string): Promise<{ fields: MetaOverride; version: number; publishedBy: string; publishedAt: Date } | null> {
  const [row] = await db.select().from(metadataOverrides).where(eq(metadataOverrides.path, path));
  return row ? { fields: row.fields as MetaOverride, version: row.version, publishedBy: row.publishedBy, publishedAt: row.publishedAt } : null;
}

export interface Draft {
  fields: MetaOverride;
  savedBy: string;
  savedAt: Date;
}

export async function getDraft(db: Db, path: string): Promise<Draft | null> {
  const [row] = await db.select().from(metadataDrafts).where(eq(metadataDrafts.path, path));
  return row ? { fields: row.fields as MetaOverride, savedBy: row.savedBy, savedAt: row.savedAt } : null;
}

/** Saves edits without touching the published metadata (the public site never reads drafts). */
export async function saveDraft(db: Db, path: string, fields: MetaOverride, actor: string): Promise<Draft> {
  const now = new Date();
  await db
    .insert(metadataDrafts)
    .values({ path, fields, savedBy: actor, savedAt: now })
    .onConflictDoUpdate({ target: metadataDrafts.path, set: { fields, savedBy: actor, savedAt: now } });
  return { fields, savedBy: actor, savedAt: now };
}

export async function discardDraft(db: Db, path: string) {
  await db.delete(metadataDrafts).where(eq(metadataDrafts.path, path));
}

/**
 * Publishes in one statement (the override row is replaced atomically, so a
 * failure leaves the previous published metadata in place), then records
 * history. The draft is cleared only after a successful publish.
 */
export async function publishOverride(db: Db, path: string, fields: MetaOverride, actor: string, action: "publish" | "restore" | "reset" = "publish") {
  const cur = await getOverride(db, path);
  const version = (cur?.version ?? 0) + 1;
  const empty = !Object.keys(fields).length;
  if (empty) await db.delete(metadataOverrides).where(eq(metadataOverrides.path, path));
  else
    await db
      .insert(metadataOverrides)
      .values({ path, fields, version, publishedBy: actor, publishedAt: new Date() })
      .onConflictDoUpdate({ target: metadataOverrides.path, set: { fields, version, publishedBy: actor, publishedAt: new Date() } });
  const [change] = await db
    .insert(metadataChanges)
    .values({ path, actor, action: empty && action === "publish" ? "reset" : action, before: cur?.fields ?? {}, after: fields, version })
    .returning();
  if (action === "publish") await discardDraft(db, path).catch(() => {});
  return change;
}

export async function changeHistory(db: Db, path: string, limit = 50) {
  return db.select().from(metadataChanges).where(eq(metadataChanges.path, path)).orderBy(desc(metadataChanges.at)).limit(limit);
}

export async function getChange(db: Db, id: number) {
  const [row] = await db.select().from(metadataChanges).where(eq(metadataChanges.id, id));
  return row ?? null;
}

/** Compares the live rendered page against what was published. */
export function compareRendered(expected: { title?: string; description?: string; canonical?: string; robotsNoindex?: boolean }, facts: PageFacts) {
  const mismatches: string[] = [];
  if (expected.title !== undefined && facts.titles[0] !== expected.title) mismatches.push(`title is "${facts.titles[0] ?? "(none)"}"`);
  if (expected.description !== undefined && facts.metaDescriptions[0] !== expected.description) mismatches.push(`description is "${facts.metaDescriptions[0] ?? "(none)"}"`);
  // Compare as URLs: Next renders the root canonical without the trailing slash.
  const sameUrl = (a: string | undefined, b: string) => {
    try {
      return !!a && new URL(a).href === new URL(b).href;
    } catch {
      return false;
    }
  };
  if (expected.canonical !== undefined && !sameUrl(facts.canonicals[0], expected.canonical)) mismatches.push(`canonical is "${facts.canonicals[0] ?? "(none)"}"`);
  if (expected.robotsNoindex !== undefined) {
    const noindex = facts.metaRobots.some((r) => /\bnoindex\b/.test(r));
    if (noindex !== expected.robotsNoindex) mismatches.push(`robots is "${facts.metaRobots.join(", ") || "(none)"}"`);
  }
  return mismatches;
}

export async function recordVerification(db: Db, changeId: number, verified: boolean, note: string) {
  await db.update(metadataChanges).set({ verified, verificationNote: note.slice(0, 500) }).where(eq(metadataChanges.id, changeId));
}
