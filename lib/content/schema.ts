// Controlled page content for SEO Studio: typed field schemas, strict
// validation, layered resolution and change diffs. Pure module (no Next/React
// imports) so it runs under `node --test`.
//
// A content document stores only what differs from the code defaults:
//   {
//     shared: { field: value },                 // language-independent (toggles, images, list order)
//     text:   { en: { path: "…" }, ar: { … } }  // per language
//   }
// Text paths are a field name ("eyebrow") or, inside a list, "values.<itemId>.name".
// Resolution for a language: that language → English override → code default.
// Missing translations are never filled in the database; they are reported.

import { DEFAULT_LOCALE, LOCALE_CODES } from "../i18n/locales.ts";
import { MetadataValidationError } from "../seo/core/metadata.ts";

export interface TextSpec {
  kind: "text";
  label: string;
  /** Hard limit; chosen so the text still fits the existing layout. */
  max: number;
  multiline?: boolean;
  help?: string;
}
export interface ToggleSpec {
  kind: "toggle";
  label: string;
  help?: string;
}
export interface ImageSpec {
  kind: "image";
  label: string;
  /** Alt text for this image lives in "@images" under this key. */
  altKey: string;
  help?: string;
}
export interface ChoiceSpec {
  kind: "choice";
  label: string;
  options: readonly { value: string; label: string }[];
}
export interface ListSpec {
  kind: "list";
  label: string;
  itemLabel: string;
  min: number;
  max: number;
  text: Record<string, TextSpec>;
  shared: Record<string, ChoiceSpec>;
  help?: string;
}
export type FieldSpec = TextSpec | ToggleSpec | ImageSpec | ChoiceSpec | ListSpec;

export type ListItem = { id: string } & Record<string, string>;

export interface ContentDefaults {
  shared: Record<string, unknown>;
  /** English text by path. */
  text: Record<string, string>;
}

export interface ContentSchema {
  key: string;
  label: string;
  /** Section anchor on the public page, for preview links. */
  anchor: string;
  description: string;
  groups: { title: string; fields: string[]; help?: string }[];
  fields: Record<string, FieldSpec>;
  defaults: ContentDefaults;
}

export interface ContentDoc {
  shared?: Record<string, unknown>;
  text?: Record<string, Record<string, string>>;
}

export interface ResolvedContent {
  shared: Record<string, unknown>;
  /** Every text path, resolved for the requested language. */
  text: Record<string, string>;
}

export interface ValidationContext {
  /** Image paths that may be selected (the site's image library). */
  images: ReadonlySet<string>;
}

const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/;
const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,23}$/;
export const MAX_DOC_BYTES = 200_000;

const fail = (field: string, message: string): never => {
  throw new MetadataValidationError(field, message);
};

function cleanText(v: unknown, field: string, spec: TextSpec): string {
  if (typeof v !== "string") fail(field, "Must be text");
  const raw = v as string;
  if (UNSAFE.test(raw)) fail(field, "Angle brackets and control characters are not allowed");
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length > spec.max) fail(field, `At most ${spec.max} characters (this text has to fit the page layout)`);
  return s;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Shared values with the code defaults filled in. */
export function effectiveShared(schema: ContentSchema, doc: ContentDoc | null | undefined): Record<string, unknown> {
  return { ...schema.defaults.shared, ...(doc?.shared ?? {}) };
}

export function listItems(schema: ContentSchema, doc: ContentDoc | null | undefined, field: string): ListItem[] {
  const v = effectiveShared(schema, doc)[field];
  return Array.isArray(v) ? (v as ListItem[]) : [];
}

export interface TextPath {
  path: string;
  spec: TextSpec;
  /** Readable label, e.g. "Values · Pet Friendly · Name". */
  label: string;
  field: string;
}

/** Every text path of a document, given its current lists. */
export function textPaths(schema: ContentSchema, doc: ContentDoc | null | undefined): TextPath[] {
  const out: TextPath[] = [];
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (spec.kind === "text") out.push({ path: field, spec, label: spec.label, field });
    if (spec.kind === "list") {
      listItems(schema, doc, field).forEach((item, i) => {
        for (const [prop, ps] of Object.entries(spec.text)) {
          out.push({ path: `${field}.${item.id}.${prop}`, spec: ps, label: `${spec.label} · ${spec.itemLabel} ${i + 1} · ${ps.label}`, field });
        }
      });
    }
  }
  return out;
}

/** The English text for every path: English override, else code default. */
function englishText(schema: ContentSchema, doc: ContentDoc | null | undefined, path: string): string {
  return doc?.text?.[DEFAULT_LOCALE]?.[path] ?? schema.defaults.text[path] ?? "";
}

/** Shared values and text resolved for one language (language → English → default). */
export function resolveContent(schema: ContentSchema, doc: ContentDoc | null | undefined, locale: string = DEFAULT_LOCALE): ResolvedContent {
  const text: Record<string, string> = {};
  for (const { path } of textPaths(schema, doc)) {
    const own = locale !== DEFAULT_LOCALE ? doc?.text?.[locale]?.[path] : undefined;
    text[path] = own ?? englishText(schema, doc, path);
  }
  return { shared: effectiveShared(schema, doc), text };
}

/** Text paths that have English text but no translation, per language. */
export function missingTranslations(schema: ContentSchema, doc: ContentDoc | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const paths = textPaths(schema, doc).filter((p) => englishText(schema, doc, p.path) !== "");
  for (const code of LOCALE_CODES) {
    if (code === DEFAULT_LOCALE) continue;
    out[code] = paths.filter((p) => !doc?.text?.[code]?.[p.path]).map((p) => p.path);
  }
  return out;
}

function validateShared(schema: ContentSchema, input: Record<string, unknown>, ctx: ValidationContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, v] of Object.entries(input)) {
    const spec = schema.fields[field];
    if (!spec || spec.kind === "text") fail(field, `Unknown setting "${field}"`);
    if (spec.kind === "toggle") {
      if (typeof v !== "boolean") fail(field, "Must be on or off");
      out[field] = v;
    } else if (spec.kind === "image") {
      if (typeof v !== "string" || !ctx.images.has(v)) fail(field, "Choose an image from the image library");
      out[field] = v;
    } else if (spec.kind === "choice") {
      if (!spec.options.some((o) => o.value === v)) fail(field, `Must be one of: ${spec.options.map((o) => o.label).join(", ")}`);
      out[field] = v;
    } else if (spec.kind === "list") {
      if (!Array.isArray(v)) fail(field, "Must be a list");
      const items = v as unknown[];
      if (items.length < spec.min || items.length > spec.max) fail(field, `Between ${spec.min} and ${spec.max} ${spec.itemLabel.toLowerCase()}s`);
      const seen = new Set<string>();
      out[field] = items.map((raw, i) => {
        if (!isObj(raw)) fail(`${field}.${i}`, "Invalid item");
        const item = raw as Record<string, unknown>;
        const id = item.id;
        if (typeof id !== "string" || !ITEM_ID.test(id) || seen.has(id)) fail(`${field}.${i}`, "Each item needs a unique id");
        seen.add(id as string);
        const clean: ListItem = { id: id as string };
        for (const k of Object.keys(item)) if (k !== "id" && !(k in spec.shared)) fail(`${field}.${i}.${k}`, `Unknown property "${k}"`);
        for (const [prop, ps] of Object.entries(spec.shared)) {
          const pv = item[prop];
          if (!ps.options.some((o) => o.value === pv)) fail(`${field}.${i}.${prop}`, `${ps.label}: choose one of ${ps.options.map((o) => o.label).join(", ")}`);
          clean[prop] = pv as string;
        }
        return clean;
      });
    }
  }
  return out;
}

/**
 * Validates a content document. Unknown fields, paths and languages are
 * rejected; text is trimmed and length-limited; values equal to the code
 * defaults are dropped so only real overrides are stored. Empty text means
 * "not set" (falls back), never an empty string on the page.
 */
export function validateContent(schema: ContentSchema, input: unknown, ctx: ValidationContext): ContentDoc {
  if (!isObj(input)) fail("content", "Must be an object");
  const doc = input as Record<string, unknown>;
  for (const k of Object.keys(doc)) if (k !== "shared" && k !== "text") fail(k, `Unknown section "${k}"`);
  if (doc.shared !== undefined && !isObj(doc.shared)) fail("shared", "Must be an object");
  if (doc.text !== undefined && !isObj(doc.text)) fail("text", "Must be an object");

  const shared = validateShared(schema, (doc.shared as Record<string, unknown>) ?? {}, ctx);
  // Required text: every list item (including new ones) must have English text.
  const withShared: ContentDoc = { shared };
  const paths = new Map(textPaths(schema, withShared).map((p) => [p.path, p]));

  const text: Record<string, Record<string, string>> = {};
  for (const [locale, entries] of Object.entries((doc.text as Record<string, unknown>) ?? {})) {
    if (!(LOCALE_CODES as readonly string[]).includes(locale)) fail(`text.${locale}`, `Unknown language "${locale}"`);
    if (!isObj(entries)) fail(`text.${locale}`, "Must be an object");
    const clean: Record<string, string> = {};
    for (const [path, v] of Object.entries(entries as Record<string, unknown>)) {
      const p = paths.get(path);
      if (!p) {
        // Text of a list item that was removed is dropped, not an error.
        if (path.includes(".")) continue;
        fail(path, `Unknown text "${path}"`);
      }
      const s = cleanText(v, `${locale}.${path}`, p!.spec);
      if (!s) continue;
      if (locale === DEFAULT_LOCALE && s === schema.defaults.text[path]) continue;
      clean[path] = s;
    }
    if (Object.keys(clean).length) text[locale] = clean;
  }
  for (const p of paths.values()) {
    if (!(text[DEFAULT_LOCALE]?.[p.path] ?? schema.defaults.text[p.path])) fail(`${DEFAULT_LOCALE}.${p.path}`, `${p.label}: English text is required`);
  }

  // Shared values equal to the defaults are not stored.
  for (const [k, v] of Object.entries(shared)) if (JSON.stringify(v) === JSON.stringify(schema.defaults.shared[k])) delete shared[k];
  const out: ContentDoc = {};
  if (Object.keys(shared).length) out.shared = shared;
  if (Object.keys(text).length) out.text = text;
  if (JSON.stringify(out).length > MAX_DOC_BYTES) fail("content", "This document is too large");
  return out;
}

export interface ContentDiffRow {
  label: string;
  before: string;
  after: string;
}

const showShared = (spec: FieldSpec, v: unknown): string => {
  if (v === undefined || v === null || v === "") return "—";
  if (spec.kind === "toggle") return v ? "Shown" : "Hidden";
  if (spec.kind === "choice") return spec.options.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
};

/** What visibly changes between two versions of a content document (all languages). */
export function contentDiff(schema: ContentSchema, before: ContentDoc | null, after: ContentDoc | null): ContentDiffRow[] {
  const rows: ContentDiffRow[] = [];
  const a = effectiveShared(schema, before);
  const b = effectiveShared(schema, after);
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (spec.kind === "text") continue;
    if (spec.kind === "list") {
      const names = (doc: ContentDoc | null) =>
        listItems(schema, doc, field)
          .map((it) => englishText(schema, doc, `${field}.${it.id}.${Object.keys(spec.text)[0]}`) || it.id)
          .join(", ") || "—";
      const before_ = names(before);
      const after_ = names(after);
      const shapeA = JSON.stringify(a[field]);
      const shapeB = JSON.stringify(b[field]);
      if (shapeA !== shapeB) rows.push({ label: `${schema.label} · ${spec.label}`, before: before_, after: after_ });
      continue;
    }
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) rows.push({ label: `${schema.label} · ${spec.label}`, before: showShared(spec, a[field]), after: showShared(spec, b[field]) });
  }
  const locales = [DEFAULT_LOCALE, ...LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE)];
  const allPaths = new Map<string, TextPath>();
  for (const p of [...textPaths(schema, before), ...textPaths(schema, after)]) allPaths.set(p.path, p);
  for (const locale of locales) {
    for (const p of allPaths.values()) {
      const x = locale === DEFAULT_LOCALE ? englishText(schema, before, p.path) : before?.text?.[locale]?.[p.path] ?? "";
      const y = locale === DEFAULT_LOCALE ? englishText(schema, after, p.path) : after?.text?.[locale]?.[p.path] ?? "";
      if (x !== y) rows.push({ label: `${schema.label} · ${p.label} (${locale})`, before: x || "—", after: y || (locale === DEFAULT_LOCALE ? "—" : "— (falls back to English)") });
    }
  }
  return rows;
}
