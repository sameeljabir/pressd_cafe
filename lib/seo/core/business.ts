// Business details for the home page's structured data (schema.org JSON-LD).
// Pure module. The defaults reproduce the JSON-LD the layout rendered before
// this became editable, key for key, so with nothing published the page is unchanged.

import { MetadataValidationError } from "./metadata.ts";

export interface OpeningRow {
  days: string; // e.g. "Mo-Th" or "Sa,Su"
  opens: string; // "07:00"
  closes: string; // "23:00" ("00:00" = midnight)
}

export interface BusinessInfo {
  name: string;
  url: string;
  telephone: string;
  email: string;
  servesCuisine: string[];
  priceRange: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  latitude: string;
  longitude: string;
  openingHours: OpeningRow[];
}

/** Exactly the values that were hard-coded in app/(site)/layout.tsx. */
export const BUSINESS_DEFAULTS: BusinessInfo = {
  name: "PRESS'D Wellness Café",
  url: "",
  telephone: "",
  email: "",
  servesCuisine: ["Healthy", "Breakfast", "Coffee"],
  priceRange: "AED 18-65",
  streetAddress: "",
  addressLocality: "Jumeirah Village Triangle",
  addressRegion: "Dubai",
  postalCode: "",
  addressCountry: "AE",
  latitude: "",
  longitude: "",
  openingHours: [
    { days: "Mo-Th", opens: "07:00", closes: "23:00" },
    { days: "Fr-Su", opens: "07:00", closes: "00:00" },
  ],
};

const DAY = "(Mo|Tu|We|Th|Fr|Sa|Su)";
const DAYS_RE = new RegExp(`^${DAY}(-${DAY})?(,${DAY}(-${DAY})?)*$`);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const UNSAFE = /[\u0000-\u001f\u007f<>]/;

function text(v: unknown, field: string, max: number, required = false): string {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") throw new MetadataValidationError(field, "Must be text");
  if (UNSAFE.test(v)) throw new MetadataValidationError(field, "Angle brackets and control characters are not allowed");
  const s = v.replace(/\s+/g, " ").trim();
  if (required && !s) throw new MetadataValidationError(field, "Required");
  if (s.length > max) throw new MetadataValidationError(field, `At most ${max} characters`);
  return s;
}

/**
 * Validates business details. Missing fields keep their defaults (stored drafts
 * hold only the changed fields, and are validated again when published); an
 * empty string clears a field. Returns only fields that differ from the defaults.
 */
export function validateBusiness(raw: Record<string, unknown>): Partial<BusinessInfo> {
  const known = new Set(Object.keys(BUSINESS_DEFAULTS));
  for (const k of Object.keys(raw)) if (!known.has(k)) throw new MetadataValidationError(k, `Unknown field ${k}`);
  const input: Record<string, unknown> = { ...BUSINESS_DEFAULTS, ...raw };
  const v: BusinessInfo = {
    name: text(input.name, "name", 120, true),
    url: text(input.url, "url", 200),
    telephone: text(input.telephone, "telephone", 30),
    email: text(input.email, "email", 120),
    servesCuisine: [],
    priceRange: text(input.priceRange, "priceRange", 40),
    streetAddress: text(input.streetAddress, "streetAddress", 160),
    addressLocality: text(input.addressLocality, "addressLocality", 120),
    addressRegion: text(input.addressRegion, "addressRegion", 80),
    postalCode: text(input.postalCode, "postalCode", 20),
    addressCountry: text(input.addressCountry, "addressCountry", 2).toUpperCase(),
    latitude: text(input.latitude, "latitude", 20),
    longitude: text(input.longitude, "longitude", 20),
    openingHours: [],
  };
  if (v.url) {
    let u: URL;
    try {
      u = new URL(v.url);
    } catch {
      throw new MetadataValidationError("url", "Not a valid URL");
    }
    if (u.protocol !== "https:") throw new MetadataValidationError("url", "Must start with https://");
  }
  if (v.telephone && !/^\+?[0-9 ()-]{6,24}$/.test(v.telephone)) throw new MetadataValidationError("telephone", "Use digits, spaces, + ( ) - only, e.g. +971 4 123 4567");
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new MetadataValidationError("email", "Not a valid email address");
  if (v.addressCountry && !/^[A-Z]{2}$/.test(v.addressCountry)) throw new MetadataValidationError("addressCountry", "Two-letter country code, e.g. AE");
  for (const [f, lo, hi] of [["latitude", -90, 90], ["longitude", -180, 180]] as const) {
    if (!v[f]) continue;
    const n = Number(v[f]);
    if (!/^-?\d+(\.\d+)?$/.test(v[f]) || n < lo || n > hi) throw new MetadataValidationError(f, `A number between ${lo} and ${hi}`);
  }
  if (!!v.latitude !== !!v.longitude) throw new MetadataValidationError(v.latitude ? "longitude" : "latitude", "Enter both latitude and longitude, or neither");
  const cuisine = input.servesCuisine;
  if (!Array.isArray(cuisine)) throw new MetadataValidationError("servesCuisine", "Must be a list");
  v.servesCuisine = [...new Set(cuisine.map((c, i) => text(c, `servesCuisine.${i}`, 40)).filter(Boolean))].slice(0, 10);
  const hours = input.openingHours;
  if (!Array.isArray(hours) || hours.length > 7) throw new MetadataValidationError("openingHours", "Up to 7 rows");
  v.openingHours = hours.map((row, i) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const days = text(r.days, `openingHours.${i}`, 40).replace(/\s/g, "");
    const opens = text(r.opens, `openingHours.${i}`, 5);
    const closes = text(r.closes, `openingHours.${i}`, 5);
    if (!DAYS_RE.test(days)) throw new MetadataValidationError(`openingHours.${i}`, "Days like Mo-Th or Sa,Su (Mo Tu We Th Fr Sa Su)");
    if (!TIME_RE.test(opens) || !TIME_RE.test(closes)) throw new MetadataValidationError(`openingHours.${i}`, "Times as HH:MM (24-hour)");
    return { days, opens, closes };
  });
  const out: Partial<BusinessInfo> = {};
  for (const k of Object.keys(BUSINESS_DEFAULTS) as (keyof BusinessInfo)[]) {
    if (JSON.stringify(v[k]) !== JSON.stringify(BUSINESS_DEFAULTS[k])) (out as Record<string, unknown>)[k] = v[k];
  }
  return out;
}

export function effectiveBusiness(o: Partial<BusinessInfo> | null | undefined): BusinessInfo {
  return { ...BUSINESS_DEFAULTS, ...(o ?? {}) };
}

/**
 * Builds the JSON-LD object. Optional fields appear only when filled, so the
 * defaults produce exactly the original object (same keys, same order).
 */
export function buildJsonLd(o: Partial<BusinessInfo> | null | undefined): Record<string, unknown> {
  const b = effectiveBusiness(o);
  const address: Record<string, unknown> = { "@type": "PostalAddress" };
  if (b.streetAddress) address.streetAddress = b.streetAddress;
  if (b.addressLocality) address.addressLocality = b.addressLocality;
  if (b.addressRegion) address.addressRegion = b.addressRegion;
  if (b.postalCode) address.postalCode = b.postalCode;
  if (b.addressCountry) address.addressCountry = b.addressCountry;
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: b.name };
  if (b.url) ld.url = b.url;
  if (b.telephone) ld.telephone = b.telephone;
  if (b.email) ld.email = b.email;
  ld.address = address;
  if (b.latitude && b.longitude) ld.geo = { "@type": "GeoCoordinates", latitude: Number(b.latitude), longitude: Number(b.longitude) };
  if (b.servesCuisine.length) ld.servesCuisine = b.servesCuisine;
  if (b.openingHours.length) ld.openingHours = b.openingHours.map((r) => `${r.days} ${r.opens}-${r.closes}`);
  if (b.priceRange) ld.priceRange = b.priceRange;
  return ld;
}

/** JSON for a <script type="application/ld+json"> — `<` escaped so text can never close the tag. */
export function jsonLdScript(o: Partial<BusinessInfo> | null | undefined): string {
  return JSON.stringify(buildJsonLd(o)).replace(/</g, "\\u003c");
}

/** Plain-language checks shown in the dashboard. */
export function businessWarnings(b: BusinessInfo, siteText: string): string[] {
  const w: string[] = [];
  if (!b.telephone) w.push("No phone number.");
  if (!b.streetAddress) w.push("No street address.");
  if (!b.latitude) w.push("No map coordinates (latitude/longitude).");
  if (!b.openingHours.length) w.push("No opening hours.");
  if (b.addressLocality && /meydan/i.test(siteText) && !/meydan/i.test(`${b.streetAddress} ${b.addressLocality}`))
    w.push(`The address says "${b.addressLocality}", but the site describes the café as being at Meydan Polo Residence. Confirm which is correct.`);
  return w;
}
