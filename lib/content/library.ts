// The image library: every image in public/assets (generated manifest, see
// scripts/gen-image-library.mts). Content and menu images can only be chosen
// from here — no uploads, no external URLs. Pure module.

import manifest from "./image-library.json" with { type: "json" };

export interface LibraryImage {
  src: string;
  width: number;
  height: number;
  bytes: number;
  /** Source files that reference this image in code. */
  usedIn: string[];
}

export const IMAGE_LIBRARY: readonly LibraryImage[] = manifest as LibraryImage[];
export const LIBRARY_SRCS: ReadonlySet<string> = new Set(IMAGE_LIBRARY.map((i) => i.src));

/** Library paths, plus the versioned form the site already uses for one logo ("…png?v=2"). */
export function isLibraryImage(src: unknown): src is string {
  return typeof src === "string" && LIBRARY_SRCS.has(src.split("?")[0]);
}

/** Readable name for an image path: "visit-table-latte.webp" → "visit table latte". */
export function imageName(src: string): string {
  return src.replace(/^\/assets\//, "").replace(/\.[a-z]+(\?.*)?$/i, "").replace(/[-_]+/g, " ");
}
