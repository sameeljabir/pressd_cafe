"use client";

import { compareEffective, type EffectiveMeta, type RenderedMeta } from "@/lib/seo/core/metadata";
import { SITE_IMAGES } from "@/lib/siteImages";

export interface ExpectedLive {
  meta: EffectiveMeta;
  alts: Record<string, string>;
  jsonLd: Record<string, unknown>;
}

function readMeta(d: Document): RenderedMeta {
  const meta = (sel: string) => d.head.querySelector<HTMLMetaElement>(sel)?.getAttribute("content") ?? null;
  const other: Record<string, string> = {};
  d.head.querySelectorAll<HTMLMetaElement>("meta[name]").forEach((m) => (other[m.name] = m.content));
  return {
    title: d.title || null,
    description: meta('meta[name="description"]'),
    keywords: meta('meta[name="keywords"]'),
    canonical: d.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute("href") ?? null,
    robots: meta('meta[name="robots"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    ogType: meta('meta[property="og:type"]'),
    twitterCard: meta('meta[name="twitter:card"]'),
    other,
  };
}

/** Differences between what should be live and what the rendered page contains. */
export function compareLive(expected: ExpectedLive, html: string): string[] {
  const d = new DOMParser().parseFromString(html, "text/html");
  const out = compareEffective(expected.meta, readMeta(d));
  // alt text: every (image file, alt) pair the registry expects must be rendered
  const rendered = new Map<string, number>();
  d.querySelectorAll("img").forEach((img) => {
    const k = `${img.getAttribute("src")}\u0000${img.getAttribute("alt") ?? ""}`;
    rendered.set(k, (rendered.get(k) ?? 0) + 1);
  });
  const need = new Map<string, { n: number; label: string }>();
  for (const i of SITE_IMAGES) {
    const k = `${i.src}\u0000${expected.alts[i.key] ?? i.alt}`;
    need.set(k, { n: (need.get(k)?.n ?? 0) + 1, label: i.label });
  }
  for (const [k, { n, label }] of need) if ((rendered.get(k) ?? 0) < n) out.push(`alt text for "${label}" is not "${k.split("\u0000")[1]}"`);
  // structured data
  const ld = d.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(ld);
  } catch {
    /* reported below */
  }
  if (JSON.stringify(parsed) !== JSON.stringify(expected.jsonLd)) out.push("structured data (business info) differs");
  return out;
}

/** Polls the public page until it shows the expected values (or ~30 s pass). */
export async function checkLive(expected: ExpectedLive): Promise<{ ok: boolean; problems: string[] }> {
  let problems: string[] = [];
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`/?seo-check=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      problems = res.ok ? compareLive(expected, await res.text()) : [`page returned HTTP ${res.status}`];
    } catch {
      problems = ["page could not be loaded"];
    }
    if (!problems.length) return { ok: true, problems };
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, problems };
}
