// Writes lib/content/image-library.json: every image in public/assets with its
// size, plus which source files reference it in code. SEO Studio's image
// picker offers exactly these files (no uploads, no external URLs).
// Re-run after adding or removing images:  node scripts/gen-image-library.mts
// (tests/content/library.test.ts fails if the manifest is out of date).

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSETS = path.join(ROOT, "public", "assets");
const require = createRequire(path.join(ROOT, "package.json"));
const sharp = require("sharp");

const IMAGE = /\.(webp|png|jpe?g|avif|gif)$/i;
const SOURCES = ["app", "components", "lib", "data"];
const SKIP = new Set(["lib/content/image-library.json"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|json)$/.test(name)) out.push(p);
  }
  return out;
}

const files = SOURCES.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !SKIP.has(path.relative(ROOT, f)));
const texts = files.map((f) => ({ rel: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

const images = [];
for (const name of readdirSync(ASSETS).sort()) {
  if (!IMAGE.test(name)) continue;
  const full = path.join(ASSETS, name);
  const meta = await sharp(full).metadata();
  const src = `/assets/${name}`;
  const usedIn = texts.filter((t) => t.text.includes(src)).map((t) => t.rel);
  images.push({ src, width: meta.width ?? 0, height: meta.height ?? 0, bytes: statSync(full).size, usedIn });
}

writeFileSync(path.join(ROOT, "lib/content/image-library.json"), JSON.stringify(images, null, 1) + "\n");
console.log(`Wrote lib/content/image-library.json — ${images.length} images, ${images.filter((i) => !i.usedIn.length).length} not referenced in code.`);
