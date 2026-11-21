// Keyword planning records in MongoDB (seo_keywords). Saved immediately: they are
// internal data, so there is no draft/publish step and nothing reaches the public site.

import { ObjectId } from "mongodb";
import type { Db, KeywordDoc } from "../db/mongo.ts";
import { MetadataValidationError } from "../core/metadata.ts";
import { MAX_KEYWORDS_TOTAL, normalizeKeyword, validateKeywordFields, validateKeywordList, type KeywordFields, type KeywordRow } from "../core/keywords.ts";

export class KeywordConflictError extends Error {}
export class KeywordNotFoundError extends Error {}

export const isKeywordId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{24}$/.test(id);

export function toRow(d: KeywordDoc): KeywordRow {
  return {
    id: d._id.toHexString(),
    keyword: d.keyword,
    normalized: d.normalized,
    type: d.type,
    target: d.target,
    group: d.group,
    status: d.status,
    notes: d.notes,
    updatedBy: d.updatedBy,
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function listKeywords(db: Db): Promise<KeywordRow[]> {
  const docs = await db.keywords.find({}, { sort: { target: 1, type: 1, normalized: 1 }, limit: MAX_KEYWORDS_TOTAL }).toArray();
  return docs.map(toRow);
}

export async function keywordsForTarget(db: Db, targets: string[]): Promise<KeywordRow[]> {
  const docs = await db.keywords.find({ target: { $in: targets } }, { sort: { type: 1, normalized: 1 } }).toArray();
  return docs.map(toRow);
}

/**
 * Adds keywords to one page/section. Keywords already assigned to that target
 * are not duplicated; they are returned in `skipped` so the UI can say so.
 */
export async function addKeywords(db: Db, input: Record<string, unknown>, actor: string): Promise<{ added: KeywordRow[]; skipped: string[] }> {
  const { keywords, ...rest } = input;
  const list = validateKeywordList(keywords);
  const fields = validateKeywordFields(rest, false) as KeywordFields;
  if ((await db.keywords.estimatedDocumentCount()) + list.length > MAX_KEYWORDS_TOTAL) throw new MetadataValidationError("keywords", `At most ${MAX_KEYWORDS_TOTAL} keywords in total`);
  const now = new Date();
  const docs: KeywordDoc[] = list.map((keyword) => ({
    _id: new ObjectId(),
    keyword,
    normalized: normalizeKeyword(keyword),
    ...fields,
    createdBy: actor,
    createdAt: now,
    updatedBy: actor,
    updatedAt: now,
  }));
  const existing = new Set((await db.keywords.find({ target: fields.target, normalized: { $in: docs.map((d) => d.normalized) } }, { projection: { normalized: 1 } }).toArray()).map((d) => d.normalized));
  const fresh = docs.filter((d) => !existing.has(d.normalized));
  const added: KeywordDoc[] = [];
  const skipped = docs.filter((d) => existing.has(d.normalized)).map((d) => d.keyword);
  // One by one: a concurrent insert of the same keyword hits the unique index and is reported as skipped.
  for (const d of fresh) {
    try {
      await db.keywords.insertOne(d);
      added.push(d);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) skipped.push(d.keyword);
      else throw e;
    }
  }
  return { added: added.map(toRow), skipped };
}

/**
 * Updates one keyword. `expectedUpdatedAt` (the version the editor showed)
 * refuses the change if someone else edited it in the meantime.
 */
export async function updateKeyword(db: Db, id: string, input: Record<string, unknown>, actor: string, expectedUpdatedAt?: string): Promise<KeywordRow> {
  if (!isKeywordId(id)) throw new KeywordNotFoundError("Keyword not found");
  const fields = validateKeywordFields(input, true);
  if (!Object.keys(fields).length) throw new MetadataValidationError("fields", "Nothing to change");
  const _id = new ObjectId(id);
  const cur = await db.keywords.findOne({ _id });
  if (!cur) throw new KeywordNotFoundError("This keyword was deleted by someone else — reload the list.");
  if (expectedUpdatedAt && cur.updatedAt.toISOString() !== expectedUpdatedAt) throw new KeywordConflictError(`"${cur.keyword}" was changed by ${cur.updatedBy} after you loaded it. Reload to see their change.`);
  if (fields.target && fields.target !== cur.target && (await db.keywords.findOne({ normalized: cur.normalized, target: fields.target }, { projection: { _id: 1 } })))
    throw new KeywordConflictError(`"${cur.keyword}" is already assigned to that page or section.`);
  const now = new Date();
  try {
    const r = await db.keywords.findOneAndUpdate({ _id, updatedAt: cur.updatedAt }, { $set: { ...fields, updatedBy: actor, updatedAt: now } }, { returnDocument: "after" });
    if (!r) throw new KeywordConflictError(`"${cur.keyword}" was changed by someone else at the same moment. Reload and try again.`);
    return toRow(r);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new KeywordConflictError(`"${cur.keyword}" is already assigned to that page or section.`);
    throw e;
  }
}

export const MAX_DELETE_AT_ONCE = 50;

/** Deletes the listed keywords only (no filter-based deletes, capped to protect against accidents). */
export async function deleteKeywords(db: Db, ids: unknown): Promise<number> {
  if (!Array.isArray(ids) || !ids.length) throw new MetadataValidationError("ids", "Select at least one keyword");
  if (ids.length > MAX_DELETE_AT_ONCE) throw new MetadataValidationError("ids", `Delete at most ${MAX_DELETE_AT_ONCE} keywords at once`);
  if (!ids.every(isKeywordId)) throw new MetadataValidationError("ids", "Invalid keyword id");
  const r = await db.keywords.deleteMany({ _id: { $in: [...new Set(ids as string[])].map((i) => new ObjectId(i)) } });
  return r.deletedCount;
}
