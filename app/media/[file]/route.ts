import { databaseConfigured, getDb } from "@/lib/seo/db/mongo";
import { readImage } from "@/lib/blog/mediaStore";

// Public file server for uploaded images: /media/<id>.<ext>. Ids are random and
// files never change, so responses are cached for a year. Served with a fixed
// image Content-Type and nosniff, so an upload can never be treated as a page.
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([0-9a-f]{24})\.(jpg|png|webp|gif)$/.exec(file);
  if (!m || !databaseConfigured()) return new Response("Not found", { status: 404 });
  const img = await readImage(await getDb(), m[1], m[2]);
  if (!img) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "content-type": img.mime,
      "content-length": String(img.bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
