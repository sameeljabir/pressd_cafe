// Uploaded images in MongoDB GridFS (bucket "seo_media") — same database as
// SEO Studio, no extra service. Files are addressed by id, never by name.

import { createHash } from "node:crypto";
import { GridFSBucket, ObjectId } from "mongodb";
import type { Db } from "../seo/db/mongo.ts";
import { MIME, checkUpload, type ImageKind } from "./media.ts";

export interface MediaItem {
  id: string;
  src: string;
  width: number;
  height: number;
  bytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

const bucket = (db: Db) => new GridFSBucket(db.db, { bucketName: "seo_media" });

interface MediaMeta {
  kind: ImageKind;
  width: number;
  height: number;
  sha256: string;
  uploadedBy: string;
}

function toItem(f: { _id: ObjectId; length: number; uploadDate: Date; metadata?: unknown }): MediaItem {
  const m = f.metadata as MediaMeta;
  return { id: f._id.toHexString(), src: `/media/${f._id.toHexString()}.${m.kind}`, width: m.width, height: m.height, bytes: f.length, uploadedBy: m.uploadedBy, uploadedAt: f.uploadDate.toISOString() };
}

/** Stores a validated image; an identical file uploaded before is reused. */
export async function storeImage(db: Db, bytes: Uint8Array, actor: string): Promise<MediaItem> {
  const info = checkUpload(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const files = db.db.collection("seo_media.files");
  const existing = await files.findOne({ "metadata.sha256": sha256 });
  if (existing) return toItem(existing as never);
  const id = new ObjectId();
  const meta: MediaMeta = { kind: info.kind, width: info.width, height: info.height, sha256, uploadedBy: actor };
  await new Promise<void>((resolve, reject) => {
    const up = bucket(db).openUploadStreamWithId(id, `${id.toHexString()}.${info.kind}`, { metadata: meta });
    up.once("finish", () => resolve());
    up.once("error", reject);
    up.end(Buffer.from(bytes));
  });
  return toItem({ _id: id, length: bytes.length, uploadDate: new Date(), metadata: meta });
}

export async function listMedia(db: Db, limit = 200): Promise<MediaItem[]> {
  const rows = await db.db.collection("seo_media.files").find({}, { sort: { uploadDate: -1 }, limit }).toArray();
  return rows.map((r) => toItem(r as never));
}

/** The stored file for /media/<id>.<ext> (the extension must match the stored type). */
export async function readImage(db: Db, id: string, ext: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const f = await db.db.collection("seo_media.files").findOne({ _id: new ObjectId(id) });
  const kind = (f?.metadata as MediaMeta | undefined)?.kind;
  if (!f || !kind || kind !== ext) return null;
  const chunks: Buffer[] = [];
  for await (const c of bucket(db).openDownloadStream(new ObjectId(id))) chunks.push(c as Buffer);
  return { bytes: Buffer.concat(chunks), mime: MIME[kind] };
}
