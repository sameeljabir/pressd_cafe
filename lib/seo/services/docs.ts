// Draft → Confirm & Publish across all SEO Studio documents.

import { withTransaction, type Db } from "../db/mongo.ts";
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
  const row = await db.changes.findOne({ applied: { $ne: false } }, { sort: { at: -1 }, projection: { at: 1, actor: 1 } });
  return row ? { at: row.at, by: row.actor } : null;
}

export class NothingToPublishError extends Error {}

/**
 * Publishes every pending draft. All drafts are re-validated first, so an
 * invalid draft blocks the whole publish and nothing changes. With
 * transactions (every Atlas cluster) all documents go live together or not at
 * all; otherwise each document is published atomically in turn. A draft is
 * cleared only if nobody saved it again while it was being published.
 */
export async function publishAll(db: Db, actor: string, metaDefaults: EffectiveMeta, thresholds: Thresholds, site: URL) {
  const pending = await pendingChanges(db, metaDefaults, thresholds, site);
  if (!pending.length) throw new NothingToPublishError("Nothing to publish — there are no saved changes.");
  const validated: { key: DocKey; fields: object; savedAt: Date }[] = [];
  for (const p of pending) {
    const draft = await getDraft(db, p.key);
    if (!draft) continue; // discarded meanwhile
    validated.push({ key: p.key, fields: validateDoc(p.key, draft.fields as Record<string, unknown>, site), savedAt: draft.savedAt });
  }
  if (!validated.length) throw new NothingToPublishError("Nothing to publish — there are no saved changes.");
  return withTransaction(db, async (session) => {
    const changes: { key: DocKey; id: string; version: number }[] = [];
    for (const v of validated) {
      const c = await publishOverride(db, v.key, v.fields, actor, "publish", session);
      await db.drafts.deleteOne({ _id: v.key, savedAt: v.savedAt }, { session });
      changes.push({ key: v.key, id: c.id, version: c.version });
    }
    return changes;
  });
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
