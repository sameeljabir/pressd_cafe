// Draft → Confirm & Publish across all SEO Studio documents.

import { desc, max } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { metadataChanges, metadataOverrides } from "../db/schema.ts";
import { DOC_KEYS, DOC_LABELS, diffRows, validateDoc, type DiffRow, type DocKey } from "../core/docs.ts";
import { overrideWarnings, effectiveMeta, type EffectiveMeta, type MetaOverride, type Thresholds } from "../core/metadata.ts";
import { changeHistory, getDraft, getOverride, publishOverride } from "./metadata.ts";

export interface Pending {
  key: DocKey;
  label: string;
  savedBy: string;
  savedAt: Date;
  rows: DiffRow[];
  warnings: string[];
}

/** Saved drafts that differ from what is published. */
export async function pendingChanges(db: Db, metaDefaults: EffectiveMeta, thresholds: Thresholds, site: URL): Promise<Pending[]> {
  const out: Pending[] = [];
  for (const key of DOC_KEYS) {
    const [draft, live] = await Promise.all([getDraft(db, key), getOverride(db, key)]);
    if (!draft) continue;
    const rows = diffRows(key, live?.fields ?? null, draft.fields, metaDefaults);
    if (!rows.length) continue;
    const warnings = key === "/" ? overrideWarnings(draft.fields as MetaOverride, effectiveMeta(metaDefaults, draft.fields as MetaOverride), thresholds, site, "/") : [];
    out.push({ key, label: DOC_LABELS[key], savedBy: draft.savedBy, savedAt: draft.savedAt, rows, warnings });
  }
  return out;
}

export async function lastPublished(db: Db): Promise<{ at: Date; by: string } | null> {
  const [row] = await db.select({ at: metadataChanges.at, by: metadataChanges.actor }).from(metadataChanges).orderBy(desc(metadataChanges.at)).limit(1);
  return row ?? null;
}

export async function publishedCount(db: Db) {
  const [r] = await db.select({ n: max(metadataOverrides.version) }).from(metadataOverrides);
  return r?.n ?? 0;
}

export class NothingToPublishError extends Error {}

/**
 * Publishes every pending draft. All drafts are re-validated first, so an
 * invalid draft blocks the whole publish and nothing changes. Each document is
 * then published in its own atomic statement.
 */
export async function publishAll(db: Db, actor: string, metaDefaults: EffectiveMeta, thresholds: Thresholds, site: URL) {
  const pending = await pendingChanges(db, metaDefaults, thresholds, site);
  if (!pending.length) throw new NothingToPublishError("Nothing to publish — there are no saved changes.");
  const validated: { key: DocKey; fields: object }[] = [];
  for (const p of pending) {
    const draft = await getDraft(db, p.key);
    validated.push({ key: p.key, fields: validateDoc(p.key, draft!.fields as Record<string, unknown>, site) });
  }
  const changes: { key: DocKey; id: number; version: number }[] = [];
  for (const v of validated) {
    const c = await publishOverride(db, v.key, v.fields as MetaOverride, actor);
    changes.push({ key: v.key, id: c.id, version: c.version });
  }
  return changes;
}

/** Publish history of one document, with readable per-field changes. */
export async function historyRows(db: Db, key: DocKey, metaDefaults: EffectiveMeta) {
  const rows = await changeHistory(db, key);
  return rows.map((h) => ({
    id: h.id,
    at: h.at.toISOString(),
    actor: h.actor,
    action: h.action,
    version: h.version,
    changes: diffRows(key, (h.before ?? null) as object | null, (h.after ?? null) as object | null, metaDefaults),
    verified: h.verified,
  }));
}
