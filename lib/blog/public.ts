import "server-only";
// What the public blog reads. Published versions only — except in Draft Mode
// for a signed-in SEO Studio user (checked with isPreview), where a post's
// saved draft is shown instead. Same failure policy as lib/seo/public.ts:
// a database error during regeneration throws, so the last good page stays.

import { databaseConfigured, getDb } from "../seo/db/mongo.ts";
import { readOverrideResilient } from "../seo/public.ts";
import { isPublic, type BlogPost, type PublishedPost } from "./post.ts";

const BLOG_RE = /^@blog:[0-9a-f]{24}$/;
const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";

/** Every published version (any visibility), newest first. */
async function allPublished(): Promise<PublishedPost[]> {
  if (!databaseConfigured()) return [];
  const rows = await readOverrideResilient(
    async () => {
      const db = await getDb();
      const docs = await db.overrides.find({ _id: { $regex: BLOG_RE } }, { projection: { fields: 1, publishedAt: 1 } }).toArray();
      return docs.map((d) => ({ ...(d.fields as BlogPost), id: d._id.slice(6), updatedAt: d.publishedAt.toISOString() })) as never;
    },
    { isBuild: isBuild() },
  );
  return ((rows as unknown as PublishedPost[] | null) ?? []).sort((a, b) => (b.publishDate || b.updatedAt).localeCompare(a.publishDate || a.updatedAt));
}

/** Posts visible on /blog now (live and dated in the past). */
export async function publicPosts(now = new Date()): Promise<PublishedPost[]> {
  return (await allPublished()).filter((p) => isPublic(p, now));
}

export async function publicPostBySlug(slug: string, now = new Date()): Promise<PublishedPost | null> {
  return (await publicPosts(now)).find((p) => p.slug === slug) ?? null;
}

/**
 * Preview only (caller has checked isPreview()): the saved draft with this slug,
 * else the published version with this slug, whatever its visibility.
 */
export async function previewPostBySlug(slug: string): Promise<PublishedPost | null> {
  const db = await getDb();
  const draft = await db.drafts.findOne({ _id: { $regex: BLOG_RE }, "fields.slug": slug });
  if (draft) return { ...(draft.fields as BlogPost), id: draft._id.slice(6), updatedAt: draft.savedAt.toISOString() };
  const live = await db.overrides.findOne({ _id: { $regex: BLOG_RE }, "fields.slug": slug });
  return live ? { ...(live.fields as BlogPost), id: live._id.slice(6), updatedAt: live.publishedAt.toISOString() } : null;
}
