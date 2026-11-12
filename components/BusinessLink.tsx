"use client";

import type { AnchorHTMLAttributes } from "react";
import { useBusiness } from "@/components/SiteContentContext";
import type { BusinessInfo } from "@/lib/seo/core/business";

/** A link to one of the café's profiles from Business info (usable in server components). */
export default function BusinessLink({ field, ...props }: { field: "instagram" | "facebook" | "tiktok" | "threads" | "mapsUrl" } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const business: BusinessInfo = useBusiness();
  return <a {...props} href={business[field]} />;
}
