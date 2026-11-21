import { BadRequest, ForbiddenAction, handle, ok, readJson } from "@/lib/seo/api";
import { can } from "@/lib/seo/core/permissions";
import { getDb } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { refreshPublicPage } from "@/lib/seo/services/verify";
import { isPostId } from "@/lib/blog/post";
import { deletePost, setPostState } from "@/lib/blog/service";
import { postContext } from "@/lib/blog/ctx";

const MAX = 50;

// Bulk unpublish / archive / delete of explicitly selected posts (never a filter).
export const POST = handle("content:draft", async (req, viewer) => {
  const { ids, action } = await readJson(req, 8_000);
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX || !ids.every(isPostId)) throw new BadRequest(`Select 1–${MAX} articles`);
  if (action !== "unpublish" && action !== "archive" && action !== "delete") throw new BadRequest("Unknown action");
  const canPublish = can(viewer.role, "content:publish");
  if (action !== "delete" && !canPublish) throw new ForbiddenAction(`Your role (${viewer.role}) cannot unpublish or archive articles`);
  const db = await getDb();
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of new Set(ids as string[])) {
    try {
      if (action === "delete") await deletePost(db, id, viewer.email, canPublish);
      else await setPostState(db, id, action === "archive" ? "archived" : "unpublished", postContext(), viewer.email);
      done.push(id);
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : "failed" });
    }
  }
  if (done.length) refreshPublicPage("/");
  await logAdmin(db, viewer.email, `blog_bulk_${action}`, null, { done: done.length, failed: failed.length });
  return ok({ done, failed });
});
