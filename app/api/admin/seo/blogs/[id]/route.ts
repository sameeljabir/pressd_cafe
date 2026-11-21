import { BadRequest, ForbiddenAction, handle, ok, readJson } from "@/lib/seo/api";
import { can } from "@/lib/seo/core/permissions";
import { getDb } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { refreshPublicPage } from "@/lib/seo/services/verify";
import { deletePost, duplicatePost, publishPost, setPostState } from "@/lib/blog/service";
import { postContext } from "@/lib/blog/ctx";

type Ctx = { params: Promise<{ id: string }> };
const PUBLISH_ACTIONS = new Set(["publish", "unpublish", "archive", "republish"]);

// Per-post actions. Publishing actions need publish rights and go through the
// same publish/history path as Confirm & Publish.
export const POST = handle<Ctx>("content:draft", async (req, viewer, ctx) => {
  const { id } = await ctx.params;
  const { action } = await readJson(req, 2_000);
  if (typeof action !== "string") throw new BadRequest("action is required");
  if (PUBLISH_ACTIONS.has(action) && !can(viewer.role, "content:publish")) throw new ForbiddenAction(`Your role (${viewer.role}) cannot publish or unpublish articles`);
  const db = await getDb();
  const pc = postContext();
  let result: unknown;
  if (action === "publish") result = await publishPost(db, id, pc, viewer.email);
  else if (action === "unpublish") result = await setPostState(db, id, "unpublished", pc, viewer.email);
  else if (action === "archive") result = await setPostState(db, id, "archived", pc, viewer.email);
  else if (action === "republish") result = await setPostState(db, id, "live", pc, viewer.email);
  else if (action === "duplicate") result = await duplicatePost(db, id, pc, viewer.email);
  else throw new BadRequest("Unknown action");
  if (PUBLISH_ACTIONS.has(action)) refreshPublicPage("/");
  await logAdmin(db, viewer.email, `blog_${action}`, id);
  return ok({ result }, action === "duplicate" ? 201 : 200);
});

export const DELETE = handle<Ctx>("content:draft", async (_req, viewer, ctx) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const r = await deletePost(db, id, viewer.email, can(viewer.role, "content:publish"));
  if (r.slug) refreshPublicPage("/");
  await logAdmin(db, viewer.email, "blog_deleted", id);
  return ok({ deleted: true });
});
