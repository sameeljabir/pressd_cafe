import { BadRequest, handle, ok, readJson } from "@/lib/seo/api";
import { getDb } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { addKeywords, deleteKeywords, listKeywords, updateKeyword } from "@/lib/seo/services/keywords";

// Keyword planning (internal data — never rendered on the public site).
// Every write returns the stored rows, so the editor shows exactly what was saved.

export const GET = handle("reports:read", async () => ok({ keywords: await listKeywords(await getDb()) }));

export const POST = handle("metadata:draft", async (req, viewer) => {
  const body = await readJson(req, 32_000);
  const db = await getDb();
  const r = await addKeywords(db, body, viewer.email);
  if (r.added.length) await logAdmin(db, viewer.email, "keywords_added", String(body.target ?? "/"), { count: r.added.length });
  return ok(r, 201);
});

export const PATCH = handle("metadata:draft", async (req, viewer) => {
  const { id, fields, expectedUpdatedAt } = await readJson(req, 8_000);
  if (typeof id !== "string") throw new BadRequest("id is required");
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new BadRequest("fields must be an object");
  if (expectedUpdatedAt !== undefined && typeof expectedUpdatedAt !== "string") throw new BadRequest("expectedUpdatedAt must be a date");
  const keyword = await updateKeyword(await getDb(), id, fields as Record<string, unknown>, viewer.email, expectedUpdatedAt as string | undefined);
  return ok({ keyword });
});

export const DELETE = handle("metadata:draft", async (req, viewer) => {
  const { ids } = await readJson(req, 8_000);
  const db = await getDb();
  const deleted = await deleteKeywords(db, ids);
  await logAdmin(db, viewer.email, "keywords_deleted", null, { count: deleted });
  return ok({ deleted });
});
