import { BadRequest, handle, ok, readJson } from "@/lib/seo/api";
import { isDocKey, validateDoc } from "@/lib/seo/core/docs";
import { getDb, siteUrl } from "@/lib/seo/server";
import { discardDraft, saveDraft } from "@/lib/seo/services/metadata";

// Save a draft of one document ("/", "@images" or "@business"). Drafts never reach the public site.
export const POST = handle("metadata:draft", async (req, viewer) => {
  const body = await readJson(req);
  if (!isDocKey(body.key)) throw new BadRequest("Unknown document");
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) throw new BadRequest("fields must be an object");
  const fields = validateDoc(body.key, body.fields as Record<string, unknown>, siteUrl());
  const draft = await saveDraft(await getDb(), body.key, fields, viewer.email);
  return ok({ draft: { fields: draft.fields, savedBy: draft.savedBy, savedAt: draft.savedAt } });
});

export const DELETE = handle("metadata:draft", async (req) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!isDocKey(key)) throw new BadRequest("Unknown document");
  await discardDraft(await getDb(), key);
  return ok({ discarded: true });
});
