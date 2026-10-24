// Alt-text overrides for site images. Pure module.

import { SITE_IMAGE_BY_KEY, SITE_IMAGES } from "../../siteImages.ts";
import { MetadataValidationError } from "./metadata.ts";

export const ALT_MAX = 250;
export const ALT_MIN_GOOD = 15; // shorter than this is flagged "too short" (guidance)

export type AltStatus = "missing" | "short" | "good" | "decorative";

/** Decorative images (default alt "") stay decorative when left empty. */
export function altStatus(alt: string, decorativeByDefault: boolean): AltStatus {
  const a = alt.trim();
  if (!a) return decorativeByDefault ? "decorative" : "missing";
  return a.length < ALT_MIN_GOOD ? "short" : "good";
}

/**
 * Validates { imageKey: altText }. Unknown keys are rejected; text may not
 * contain markup. A value equal to the default is dropped (nothing to override);
 * an empty string marks a non-decorative image as decorative — allowed but
 * reported as "missing" so it is a deliberate choice.
 */
export function validateAltOverrides(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(input)) {
    const img = SITE_IMAGE_BY_KEY.get(key);
    if (!img) throw new MetadataValidationError(key, `Unknown image "${key}"`);
    if (typeof v !== "string") throw new MetadataValidationError(key, "Must be text");
    if (/[\u0000-\u001f\u007f<>]/.test(v)) throw new MetadataValidationError(key, "Angle brackets and control characters are not allowed");
    const s = v.replace(/\s+/g, " ").trim();
    if (s.length > ALT_MAX) throw new MetadataValidationError(key, `At most ${ALT_MAX} characters`);
    if (s === img.alt) continue;
    out[key] = s;
  }
  return out;
}

export function effectiveAlts(overrides: Record<string, string> | null | undefined): Record<string, string> {
  return Object.fromEntries(SITE_IMAGES.map((i) => [i.key, overrides?.[i.key] ?? i.alt]));
}

export function altSummary(overrides: Record<string, string> | null | undefined) {
  const eff = effectiveAlts(overrides);
  let needsWork = 0;
  for (const i of SITE_IMAGES) {
    const st = altStatus(eff[i.key], i.alt === "");
    if (st === "missing" || st === "short") needsWork++;
  }
  return { total: SITE_IMAGES.length, needsWork };
}
