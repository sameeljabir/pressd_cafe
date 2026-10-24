import { BadRequest, handle, ok, readJson } from "@/lib/seo/api";
import { isDocKey, validateDoc } from "@/lib/seo/core/docs";
import { getDb, siteUrl } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { getChange, publishOverride } from "@/lib/seo/services/metadata";
import { expectedLive, refreshPublicPage } from "@/lib/seo/services/verify";

// Re-publishes the values that were live after a given change (or, with which="before", just before it).
export const POST = handle("metadata:publish", async (req, viewer) => {
  const body = await readJson(req);
  if (typeof body.changeId !== "number") throw new BadRequest("changeId is required");
  const db = await getDb();
  const change = await getChange(db, body.changeId);
  if (!change || !isDocKey(change.path)) throw new BadRequest("Change not found");
  const snapshot = (body.which === "before" ? change.before : change.after) as Record<string, unknown> | null;
  const fields = validateDoc(change.path, snapshot ?? {}, siteUrl()); // re-validated against today's rules
  const restored = await publishOverride(db, change.path, fields as never, viewer.email, Object.keys(fields).length ? "restore" : "reset");
  refreshPublicPage("/");
  await logAdmin(db, viewer.email, "restored", change.path, { fromChange: change.id, version: restored.version });
  return ok({ change: { key: change.path, id: restored.id, version: restored.version }, expected: await expectedLive(db) }, 201);
});
