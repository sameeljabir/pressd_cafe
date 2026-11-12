import "server-only";
// Loads what the public page renders: published documents, or — only in
// Draft Mode for a signed-in SEO Studio user — saved drafts on top of them.
// Draft Mode alone is not enough: without a valid session the page renders
// published content, so drafts can never reach a public visitor.

import { draftMode } from "next/headers";
import { currentViewer } from "../seo/auth/guard.ts";
import { draftDocs, publishedDocs } from "../seo/public.ts";
import { menu as BASE_MENU } from "../../data/menu.ts";
import { buildSiteContent, SITE_DOC_KEYS, type SiteContent } from "./site.ts";

/** True when this request may see drafts. Reads cookies only in Draft Mode, so normal pages stay static. */
export async function isPreview(): Promise<boolean> {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return false;
  return !!(await currentViewer());
}

export async function loadSiteDocs(): Promise<{ docs: Record<string, unknown>; preview: boolean }> {
  const preview = await isPreview();
  return { docs: preview ? await draftDocs(SITE_DOC_KEYS) : await publishedDocs(SITE_DOC_KEYS), preview };
}

export async function loadSiteContent(): Promise<{ content: SiteContent; docs: Record<string, unknown> }> {
  const { docs, preview } = await loadSiteDocs();
  return { content: buildSiteContent(docs, BASE_MENU, preview), docs };
}
