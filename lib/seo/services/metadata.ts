// SEO Studio documents in MongoDB: drafts, published values and publish
// history (full before/after snapshots, used for restore).

import { ObjectId, type ClientSession } from "mongodb";
import type { ChangeDoc, Db } from "../db/mongo.ts";
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

export async function getOverride(db: Db, key: string, session?: ClientSession): Promise<{ fields: MetaOverride; version: number; publishedBy: string; publishedAt: Date } | null> {
  const row = await db.overrides.findOne({ _id: key }, { session });
  return row ? { fields: row.fields as MetaOverride, version: row.version, publishedBy: row.publishedBy, publishedAt: row.publishedAt } : null;
}

export interface Draft {
  fields: MetaOverride;
  savedBy: string;
  savedAt: Date;
}

export async function getDraft(db: Db, key: string, session?: ClientSession): Promise<Draft | null> {
  const row = await db.drafts.findOne({ _id: key }, { session });
  return row ? { fields: row.fields as MetaOverride, savedBy: row.savedBy, savedAt: row.savedAt } : null;
}

/** Saves edits without touching the published values (the public site never reads drafts). */
export async function saveDraft(db: Db, key: string, fields: object, actor: string): Promise<Draft> {
  const savedAt = new Date();
  await db.drafts.replaceOne({ _id: key }, { fields, savedBy: actor, savedAt }, { upsert: true });
  return { fields: fields as MetaOverride, savedBy: actor, savedAt };
}

export async function discardDraft(db: Db, key: string) {
  await db.drafts.deleteOne({ _id: key });
}

/** Another publish of the same document won the race; nothing of this one was applied. */
export class ConcurrentPublishError extends Error {
  constructor(key: string) {
    super(`Someone else published "${key}" at the same moment. Nothing was changed by this request — refresh and try again.`);
    this.name = "ConcurrentPublishError";
  }
}

const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

/**
 * Publishes one document.
 *
 * The history row is written first: its unique (key, version) index lets only
 * one of two simultaneous publishes of the same document through. The published
 * value is then replaced only if it is still the version that was read.
 * Inside a transaction (every Atlas cluster) both writes commit together.
 * Without transactions the history row is marked applied only after the
 * published value is written, and is removed again if that write loses a race;
 * an interrupted publish leaves at most an unapplied history row, which is
 * hidden from history and skipped by the next version number.
 */
export async function publishOverride(db: Db, key: string, fields: object, actor: string, action: "publish" | "restore" | "reset" = "publish", session?: ClientSession): Promise<ChangeRecord> {
  const cur = await db.overrides.findOne({ _id: key }, { session });
  const [last] = await db.changes.find({ key }, { session, sort: { version: -1 }, limit: 1, projection: { version: 1 } }).toArray();
  const version = Math.max(cur?.version ?? 0, last?.version ?? 0) + 1;
  const empty = !Object.keys(fields).length;
  const now = new Date();
  const change: ChangeDoc = {
    _id: new ObjectId(),
    key,
    actor,
    action: empty && action === "publish" ? "reset" : action,
    before: cur?.fields ?? {},
    after: fields,
    version,
    at: now,
    verified: null,
    verificationNote: null,
    applied: !!session,
  };
  try {
    await db.changes.insertOne(change, { session });
  } catch (e) {
    if (isDuplicateKey(e)) throw new ConcurrentPublishError(key);
    throw e;
  }
  const expect = cur ? { _id: key, version: cur.version } : { _id: key };
  let won: boolean;
  try {
    if (empty) won = !cur || (await db.overrides.deleteOne(expect, { session })).deletedCount === 1;
    else if (cur) won = (await db.overrides.replaceOne(expect, { fields, version, publishedBy: actor, publishedAt: now }, { session })).matchedCount === 1;
    else won = !!(await db.overrides.insertOne({ _id: key, fields, version, publishedBy: actor, publishedAt: now }, { session })).insertedId;
  } catch (e) {
    if (!session) await db.changes.deleteOne({ _id: change._id }).catch(() => {});
    if (isDuplicateKey(e)) throw new ConcurrentPublishError(key);
    throw e;
  }
  if (!won) {
    if (!session) await db.changes.deleteOne({ _id: change._id }).catch(() => {});
    throw new ConcurrentPublishError(key);
  }
  if (!session) await db.changes.updateOne({ _id: change._id }, { $set: { applied: true } });
  return toRecord({ ...change, applied: true });
}

export interface ChangeRecord {
  id: string;
  key: string;
  actor: string;
  action: string;
  before: object;
  after: object;
  version: number;
  at: Date;
  verified: boolean | null;
  verificationNote: string | null;
}

function toRecord(c: ChangeDoc): ChangeRecord {
  return { id: c._id.toHexString(), key: c.key, actor: c.actor, action: c.action, before: c.before, after: c.after, version: c.version, at: c.at, verified: c.verified, verificationNote: c.verificationNote };
}

export async function changeHistory(db: Db, key: string, limit = 50): Promise<ChangeRecord[]> {
  const rows = await db.changes.find({ key, applied: { $ne: false } }, { sort: { version: -1 }, limit }).toArray();
  return rows.map(toRecord);
}

export const isChangeId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);

export async function getChange(db: Db, id: string): Promise<ChangeRecord | null> {
  if (!isChangeId(id)) return null;
  const row = await db.changes.findOne({ _id: new ObjectId(id), applied: { $ne: false } });
  return row ? toRecord(row) : null;
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

export async function recordVerification(db: Db, changeId: string, verified: boolean, note: string) {
  if (!isChangeId(changeId)) return;
  await db.changes.updateOne({ _id: new ObjectId(changeId) }, { $set: { verified, verificationNote: note.slice(0, 500) } });
}
