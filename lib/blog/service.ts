// Blog posts in MongoDB. Every write goes through the existing SEO Studio
// primitives: saveDraft (drafts collection) and publishOverride (published
// collection + history), so posts share Confirm & Publish, history and restore.

import { ObjectId } from "mongodb";
import { withTransaction, type Db } from "../seo/db/mongo.ts";
import { MetadataValidationError } from "../seo/core/metadata.ts";
import { getDraft, getOverride, publishOverride, saveDraft } from "../seo/services/metadata.ts";
import { BLOG_PREFIX, blogKey, finalizeForPublish, isPostId, publicStatus, slugify, validatePost, type BlogPost, type PostContext, type PostState, type PostStatus } from "./post.ts";

export class PostNotFoundError extends Error {}

const BLOG_RE = /^@blog:[0-9a-f]{24}$/;

export interface PostRow {
  id: string;
  draft: BlogPost | null;
  draftSavedBy: string | null;
  draftSavedAt: string | null;
  live: BlogPost | null;
  liveVersion: number | null;
  livePublishedAt: string | null;
  livePublishedBy: string | null;
  status: PostStatus;
  /** a saved draft differs from the published version */
  pending: boolean;
}

/** Every post that has a draft and/or a published version. */
export async function listPosts(db: Db, now = new Date()): Promise<PostRow[]> {
  const [drafts, lives] = await Promise.all([
    db.drafts.find({ _id: { $regex: BLOG_RE } }).toArray(),
    db.overrides.find({ _id: { $regex: BLOG_RE } }).toArray(),
  ]);
  const ids = new Set([...drafts, ...lives].map((d) => d._id.slice(BLOG_PREFIX.length)));
  const dBy = new Map(drafts.map((d) => [d._id, d]));
  const lBy = new Map(lives.map((d) => [d._id, d]));
  return [...ids].map((id) => {
    const d = dBy.get(blogKey(id));
    const l = lBy.get(blogKey(id));
    const live = (l?.fields as BlogPost | undefined) ?? null;
    return {
      id,
      draft: (d?.fields as BlogPost | undefined) ?? null,
      draftSavedBy: d?.savedBy ?? null,
      draftSavedAt: d?.savedAt.toISOString() ?? null,
      live,
      liveVersion: l?.version ?? null,
      livePublishedAt: l?.publishedAt.toISOString() ?? null,
      livePublishedBy: l?.publishedBy ?? null,
      status: publicStatus(live, now),
      pending: !!d && JSON.stringify(d.fields) !== JSON.stringify(l?.fields ?? null),
    };
  });
}

export async function getPost(db: Db, id: string) {
  if (!isPostId(id)) return null;
  const [draft, live] = await Promise.all([getDraft(db, blogKey(id)), getOverride(db, blogKey(id))]);
  if (!draft && !live) return null;
  return { draft, live };
}

/**
 * Who else uses this slug: any other post's saved draft or published version.
 * Returns that post's title, or null when the slug is free.
 */
export async function slugOwner(db: Db, slug: string, exceptId: string | null): Promise<string | null> {
  const q = { _id: { $regex: BLOG_RE, ...(exceptId ? { $ne: blogKey(exceptId) } : {}) }, "fields.slug": slug };
  const hit = (await db.drafts.findOne(q, { projection: { "fields.title": 1 } })) ?? (await db.overrides.findOne(q, { projection: { "fields.title": 1 } }));
  return hit ? ((hit.fields as { title?: string }).title ?? "another post") : null;
}

export async function assertSlugFree(db: Db, slug: string, exceptId: string | null) {
  const owner = await slugOwner(db, slug, exceptId);
  if (owner) throw new MetadataValidationError("slug", `The URL /blog/${slug} is already used by “${owner}”. Choose another slug.`);
}

/**
 * Before publishing: published slugs must be unique among published posts
 * (including the others in the same batch). Draft-vs-draft clashes are
 * already refused when saving.
 */
export async function assertPublishableSlugs(db: Db, batch: { key: string; fields: object }[]) {
  const seen = new Map<string, string>();
  for (const b of batch) {
    const p = b.fields as BlogPost;
    if (!p.slug) continue;
    if (seen.has(p.slug)) throw new MetadataValidationError("slug", `Two posts being published use /blog/${p.slug}.`);
    seen.set(p.slug, b.key);
    const other = await db.overrides.findOne({ _id: { $regex: BLOG_RE, $nin: batch.map((x) => x.key) }, "fields.slug": p.slug }, { projection: { "fields.title": 1 } });
    if (other) throw new MetadataValidationError("slug", `/blog/${p.slug} is already live for “${(other.fields as { title?: string }).title ?? "another post"}”.`);
  }
}

/** Creates a post as a saved draft (never public). */
export async function createPost(db: Db, input: Record<string, unknown>, ctx: PostContext, actor: string) {
  const id = new ObjectId().toHexString();
  const post = validatePost({ ...input, createdAt: new Date().toISOString() }, ctx);
  await assertSlugFree(db, post.slug, null);
  const draft = await saveDraft(db, blogKey(id), post, actor, null);
  return { id, savedAt: draft.savedAt.toISOString() };
}

/** Publishes one post's saved draft (validated again; a live post without a date gets "now"). */
export async function publishPost(db: Db, id: string, ctx: PostContext, actor: string) {
  if (!isPostId(id)) throw new PostNotFoundError("Post not found");
  const key = blogKey(id);
  const draft = await getDraft(db, key);
  if (!draft) throw new MetadataValidationError("draft", "There are no saved changes to publish for this post.");
  const fields = finalizeForPublish(validatePost(draft.fields as unknown as Record<string, unknown>, ctx));
  await assertPublishableSlugs(db, [{ key, fields }]);
  return withTransaction(db, async (session) => {
    const c = await publishOverride(db, key, fields, actor, "publish", session);
    await db.drafts.deleteOne({ _id: key, savedAt: draft.savedAt }, { session });
    return { id: c.id, version: c.version, slug: fields.slug };
  });
}

/**
 * Unpublish / archive / re-publish the live version straight away (recorded in
 * history). A saved draft gets the same visibility so a later Confirm &
 * Publish does not silently undo it.
 */
export async function setPostState(db: Db, id: string, state: PostState, ctx: PostContext, actor: string) {
  if (!isPostId(id)) throw new PostNotFoundError("Post not found");
  const key = blogKey(id);
  const live = await getOverride(db, key);
  if (!live) throw new MetadataValidationError("state", "This post has never been published — save it and publish it instead.");
  const fields = finalizeForPublish(validatePost({ ...(live.fields as unknown as Record<string, unknown>), state }, ctx));
  if (state === "live") await assertPublishableSlugs(db, [{ key, fields }]);
  const draft = await getDraft(db, key);
  return withTransaction(db, async (session) => {
    const c = await publishOverride(db, key, fields, actor, "publish", session);
    if (draft) await db.drafts.updateOne({ _id: key, savedAt: draft.savedAt }, { $set: { "fields.state": state } }, { session });
    return { id: c.id, version: c.version, slug: fields.slug };
  });
}

/** Deletes a post: its draft and (if published) its live version. History keeps the record. */
export async function deletePost(db: Db, id: string, actor: string, canPublish: boolean) {
  if (!isPostId(id)) throw new PostNotFoundError("Post not found");
  const key = blogKey(id);
  const live = await getOverride(db, key);
  if (live && !canPublish) throw new MetadataValidationError("delete", "This post is published. Only a publisher can delete it (or unpublish it first).");
  return withTransaction(db, async (session) => {
    let slug: string | null = null;
    if (live) {
      slug = (live.fields as BlogPost).slug;
      await publishOverride(db, key, {}, actor, "reset", session);
    }
    await db.drafts.deleteOne({ _id: key }, { session });
    return { slug };
  });
}

/** Copies a post into a new, unpublished draft with a free slug. */
export async function duplicatePost(db: Db, id: string, ctx: PostContext, actor: string) {
  const src = await getPost(db, id);
  if (!src) throw new PostNotFoundError("Post not found");
  const p = ((src.draft ?? src.live)!.fields as BlogPost);
  const base = `${p.slug}-copy`.slice(0, 74);
  let slug = base;
  for (let n = 2; await slugOwner(db, slug, null); n++) slug = `${base}-${n}`;
  const title = `Copy of ${p.title}`.slice(0, 140);
  return createPost(db, { ...p, title, slug, publishDate: "", featured: false, createdAt: undefined } as unknown as Record<string, unknown>, ctx, actor);
}

// ---------------------------------------------------------------- categories (shared list; posts store the name)

const CAT_ID = "blog-categories";

export async function getCategories(db: Db): Promise<string[]> {
  const row = await db.settings.findOne({ _id: CAT_ID });
  return ((row as unknown as { categories?: string[] } | null)?.categories ?? []).slice().sort((a, b) => a.localeCompare(b));
}

export async function addCategory(db: Db, name: unknown, actor: string): Promise<string[]> {
  if (typeof name !== "string") throw new MetadataValidationError("name", "Must be text");
  const n = name.replace(/\s+/g, " ").trim();
  if (!n || n.length > 60 || /[<>\u0000-\u001f]/.test(n)) throw new MetadataValidationError("name", "Use 1–60 characters, no angle brackets");
  if (!slugify(n)) throw new MetadataValidationError("name", "Use at least one letter or number");
  const cur = await getCategories(db);
  if (cur.some((c) => c.toLowerCase() === n.toLowerCase())) throw new MetadataValidationError("name", `“${n}” already exists`);
  if (cur.length >= 100) throw new MetadataValidationError("name", "At most 100 categories");
  await db.settings.updateOne({ _id: CAT_ID }, { $addToSet: { categories: n }, $set: { updatedBy: actor, updatedAt: new Date() } } as never, { upsert: true });
  return getCategories(db);
}

/** Removes a category from the list. Refused while any post (draft or published) still uses it. */
export async function removeCategory(db: Db, name: unknown, actor: string): Promise<string[]> {
  if (typeof name !== "string" || !name) throw new MetadataValidationError("name", "Category is required");
  const q = { _id: { $regex: BLOG_RE }, "fields.category": name };
  const used = (await db.drafts.countDocuments(q)) + (await db.overrides.countDocuments(q));
  if (used) throw new MetadataValidationError("name", `“${name}” is used by ${used} post version(s). Move those posts to another category first.`);
  await db.settings.updateOne({ _id: CAT_ID }, { $pull: { categories: name }, $set: { updatedBy: actor, updatedAt: new Date() } } as never);
  return getCategories(db);
}

/** All tags used by any post (for suggestions). */
export async function allTags(db: Db): Promise<string[]> {
  const [a, b] = await Promise.all([
    db.drafts.distinct("fields.tags", { _id: { $regex: BLOG_RE } }),
    db.overrides.distinct("fields.tags", { _id: { $regex: BLOG_RE } }),
  ]);
  return [...new Set([...a, ...b].filter((t): t is string => typeof t === "string"))].sort((x, y) => x.localeCompare(y));
}
