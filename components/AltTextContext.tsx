"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { SITE_IMAGE_BY_KEY } from "@/lib/siteImages";

// Published alt-text overrides from SEO Studio. Without a provider (or with no
// overrides) every image keeps the default alt text from lib/siteImages.ts.
const AltTextContext = createContext<Record<string, string>>({});

export function AltTextProvider({ overrides, children }: { overrides: Record<string, string> | null; children: ReactNode }) {
  return <AltTextContext.Provider value={overrides ?? {}}>{children}</AltTextContext.Provider>;
}

/** Returns alt(key): the published alt text for that image, or its default. */
export function useAlt() {
  const overrides = useContext(AltTextContext);
  return useCallback(
    (key: string) => {
      const img = SITE_IMAGE_BY_KEY.get(key);
      if (!img) throw new Error(`Unknown site image key "${key}" — add it to lib/siteImages.ts`);
      return overrides[key] ?? img.alt;
    },
    [overrides],
  );
}

/** <img> whose alt text comes from SEO Studio (for server components, which can't call hooks). */
export function SiteImg({ k, ...props }: { k: string } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt">) {
  const alt = useAlt();
  // eslint-disable-next-line @next/next/no-img-element -- same plain <img> the sections already used
  return <img {...props} alt={alt(k)} />;
}
