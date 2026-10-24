import { BadRequest, handle, ok, readJson } from "@/lib/seo/api";
import { getDb } from "@/lib/seo/server";
import { getChange, recordVerification } from "@/lib/seo/services/metadata";

// Records the result of the browser's check of the rendered public page (fetched
// from this same deployment by the publisher, so it also works behind Vercel
// Deployment Protection on previews).
export const POST = handle("metadata:publish", async (req) => {
  const body = await readJson(req);
  if (!Array.isArray(body.changeIds) || !body.changeIds.every((n) => typeof n === "number") || typeof body.verified !== "boolean") throw new BadRequest("changeIds and verified are required");
  const db = await getDb();
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : "";
  for (const id of body.changeIds.slice(0, 10) as number[]) if (await getChange(db, id)) await recordVerification(db, id, body.verified, note);
  return ok({ recorded: true });
});
