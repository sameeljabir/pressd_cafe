import { BadRequest, ForbiddenAction, handle, ok, readJson } from "@/lib/seo/api";
import { can } from "@/lib/seo/core/permissions";
import { DOC_LABELS, docBodyLimit, docPermission, isDocKey, validateDoc, type DocKey } from "@/lib/seo/core/docs";
import { getDb, siteUrl } from "@/lib/seo/server";
import { menuContext } from "@/lib/seo/services/docs";
import { discardDraft, saveDraft } from "@/lib/seo/services/metadata";
import type { Viewer } from "@/lib/seo/auth/guard";

function requireDocPermission(viewer: Viewer, key: DocKey) {
  if (!can(viewer.role, docPermission(key, "draft"))) throw new ForbiddenAction(`Your role (${viewer.role}) cannot edit ${DOC_LABELS[key]}`);
}

// Save a draft of one document (see lib/seo/core/docs.ts). Drafts never reach the public site.
// Optional `baseSavedAt` (the draft the editor started from, or null for none)
// refuses the save if someone else saved the same document in the meantime.
export const POST = handle("reports:read", async (req, viewer) => {
  const body = await readJson(req, 1_000_000);
  if (!isDocKey(body.key)) throw new BadRequest("Unknown document");
  requireDocPermission(viewer, body.key);
  if (JSON.stringify(body.fields ?? null).length > docBodyLimit(body.key)) throw new BadRequest("Request body too large");
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) throw new BadRequest("fields must be an object");
  if (body.baseSavedAt !== undefined && body.baseSavedAt !== null && typeof body.baseSavedAt !== "string") throw new BadRequest("baseSavedAt must be a date or null");
  const db = await getDb();
  const fields = validateDoc(body.key, body.fields as Record<string, unknown>, siteUrl(), await menuContext(db));
  const draft = await saveDraft(db, body.key, fields, viewer.email, body.baseSavedAt as string | null | undefined);
  return ok({ draft: { fields: draft.fields, savedBy: draft.savedBy, savedAt: draft.savedAt } });
});

export const DELETE = handle("reports:read", async (req, viewer) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!isDocKey(key)) throw new BadRequest("Unknown document");
  requireDocPermission(viewer, key);
  await discardDraft(await getDb(), key);
  return ok({ discarded: true });
});
