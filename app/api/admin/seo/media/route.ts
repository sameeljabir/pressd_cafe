import { BadRequest, handle, ok } from "@/lib/seo/api";
import { jsonError } from "@/lib/seo/auth/guard";
import { getDb } from "@/lib/seo/server";
import { logAdmin } from "@/lib/seo/services/log";
import { MAX_UPLOAD_BYTES, UploadError } from "@/lib/blog/media";
import { listMedia, storeImage } from "@/lib/blog/mediaStore";

// Uploaded images (blog covers and article images).
export const GET = handle("reports:read", async () => ok({ media: await listMedia(await getDb()) }));

export const POST = handle("content:draft", async (req, viewer) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64_000) return jsonError(413, "too_large", `Images must be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new BadRequest("Send the image as multipart/form-data (field \"file\").");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new BadRequest("No file received.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, "too_large", `Images must be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const db = await getDb();
  try {
    const item = await storeImage(db, new Uint8Array(await file.arrayBuffer()), viewer.email);
    await logAdmin(db, viewer.email, "media_uploaded", item.src, { bytes: item.bytes });
    return ok({ media: item }, 201);
  } catch (e) {
    if (e instanceof UploadError) return jsonError(400, "invalid", e.message);
    throw e;
  }
});
