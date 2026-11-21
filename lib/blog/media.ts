// Uploaded images: type detection from the file's own bytes and pixel size.
// Pure module. The browser's claimed type and the file name are never trusted.
// SVG is not accepted (it can carry script).

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PIXELS = 50_000_000;

export type ImageKind = "jpg" | "png" | "webp" | "gif";
export const MIME: Record<ImageKind, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

/** Width/height from the header, or null when the file is malformed. */
export function imageSize(b: Uint8Array, kind: ImageKind): { width: number; height: number } | null {
  try {
    if (kind === "png") return b.length >= 24 ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
    if (kind === "gif") return b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
    if (kind === "webp") {
      const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (chunk === "VP8 " && b.length >= 30) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
      if (chunk === "VP8L" && b.length >= 25) {
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X" && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
      return null;
    }
    // JPEG: walk the segments to the first start-of-frame marker
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(b, i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

export class UploadError extends Error {}

export function checkUpload(bytes: Uint8Array): { kind: ImageKind; width: number; height: number } {
  if (!bytes.length) throw new UploadError("The file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError(`Images must be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const kind = sniffImage(bytes);
  if (!kind) throw new UploadError("Only JPEG, PNG, WebP or GIF images can be uploaded.");
  const size = imageSize(bytes, kind);
  if (!size || !size.width || !size.height) throw new UploadError("The image could not be read — it may be damaged.");
  if (size.width * size.height > MAX_PIXELS) throw new UploadError("The image is too large (over 50 megapixels).");
  return { kind, ...size };
}
