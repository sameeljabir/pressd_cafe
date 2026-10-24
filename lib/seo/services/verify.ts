import "server-only";
// After a publish or restore: refresh the public page (and sitemap) and work
// out exactly what it should now render, so the editor can verify the live HTML.

import { revalidatePath } from "next/cache";
import { defaultsFrom, effectiveMeta, type EffectiveMeta, type MetaOverride } from "../core/metadata.ts";
import { siteMetadata } from "../../siteMetadata.ts";
import { siteUrl } from "../env.ts";
import type { Db } from "../db/client.ts";
import { getOverride } from "./metadata.ts";
import { effectiveAlts } from "../core/images.ts";
import { buildJsonLd, type BusinessInfo } from "../core/business.ts";

export function codeDefaults(): EffectiveMeta {
  return defaultsFrom(siteMetadata as Record<string, unknown>, siteUrl());
}

/** Expected rendered values: published fields over the code defaults. */
export function expectedFor(fields: MetaOverride | null): EffectiveMeta {
  return effectiveMeta(codeDefaults(), fields);
}

export function refreshPublicPage(path: string) {
  revalidatePath(path);
  revalidatePath("/sitemap.xml"); // noindex pages are left out of the sitemap
}

/** Everything the public page should render right now (all published documents). */
export async function expectedLive(db: Db) {
  const [meta, images, business] = await Promise.all([getOverride(db, "/"), getOverride(db, "@images"), getOverride(db, "@business")]);
  return {
    meta: expectedFor((meta?.fields as MetaOverride | undefined) ?? null),
    alts: effectiveAlts((images?.fields as Record<string, string> | undefined) ?? null),
    jsonLd: buildJsonLd((business?.fields as Partial<BusinessInfo> | undefined) ?? null),
  };
}
