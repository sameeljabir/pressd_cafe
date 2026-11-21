import { handle, ok, readJson } from "@/lib/seo/api";
import { getDb } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { createPost, listPosts } from "@/lib/blog/service";
import { postContext } from "@/lib/blog/ctx";

export const GET = handle("reports:read", async () => ok({ posts: await listPosts(await getDb()) }));

// Create: the new post is a saved draft only — nothing is public until it is published.
export const POST = handle("content:draft", async (req, viewer) => {
  const body = await readJson(req, 800_000);
  const db = await getDb();
  const r = await createPost(db, (body.fields ?? {}) as Record<string, unknown>, postContext(), viewer.email);
  await logAdmin(db, viewer.email, "blog_created", r.id);
  return ok(r, 201);
});
