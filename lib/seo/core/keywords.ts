// Keyword planning: validation, normalisation and overlap detection. Pure module.
// Keywords are internal planning data. They are never rendered on the public
// site (the optional meta keywords tag is a separate field of the page tags),
// and no search volume, difficulty or ranking is stored or estimated here.

import { MetadataValidationError, dedupeKeywords, splitKeywordText } from "./metadata.ts";

export const KEYWORD_TYPES = ["primary", "secondary", "label"] as const;
export type KeywordType = (typeof KEYWORD_TYPES)[number];
export const KEYWORD_STATUSES = ["not-started", "in-progress", "optimized"] as const;
export type KeywordStatus = (typeof KEYWORD_STATUSES)[number];

export const TYPE_LABELS: Record<KeywordType, string> = { primary: "Primary", secondary: "Secondary", label: "Internal label" };
export const STATUS_LABELS: Record<KeywordStatus, string> = { "not-started": "Not started", "in-progress": "In progress", optimized: "Optimized" };

/**
 * Where a keyword can be assigned. The site has one URL (/); its sections are
 * views of that page (#hash), so they share its title and description.
 */
export const KEYWORD_TARGETS = [
  { id: "/", label: "Home — whole page" },
  { id: "/#about", label: "About section" },
  { id: "/#menu", label: "Menu section" },
  { id: "/#work", label: "Work from PRESS'D section" },
  { id: "/#wellness", label: "Wellness section" },
  { id: "/#visit", label: "Visit section" },
] as const;
export type KeywordTarget = (typeof KEYWORD_TARGETS)[number]["id"];
export const targetLabel = (id: string) => KEYWORD_TARGETS.find((t) => t.id === id)?.label ?? id;

export const MAX_KEYWORD_LENGTH = 80;
export const MAX_KEYWORDS_PER_REQUEST = 50;
export const MAX_KEYWORDS_TOTAL = 2000;

const UNSAFE = /[\u0000-\u001f\u007f<>]/;

export function normalizeKeyword(k: string): string {
  return k.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

function oneOf<T extends string>(v: unknown, list: readonly T[], field: string, fallback?: T): T {
  if ((v === undefined || v === null || v === "") && fallback) return fallback;
  if (typeof v !== "string" || !(list as readonly string[]).includes(v)) throw new MetadataValidationError(field, `Must be one of: ${list.join(", ")}`);
  return v as T;
}

function plain(v: unknown, field: string, max: number): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new MetadataValidationError(field, "Must be text");
  if (UNSAFE.test(v.replace(/[\n\r\t]/g, " "))) throw new MetadataValidationError(field, "Angle brackets and control characters are not allowed");
  const s = field === "notes" ? v.replace(/[ \t]+/g, " ").trim() : v.replace(/\s+/g, " ").trim();
  if (s.length > max) throw new MetadataValidationError(field, `At most ${max} characters`);
  return s;
}

export interface KeywordFields {
  type: KeywordType;
  target: KeywordTarget;
  group: string;
  status: KeywordStatus;
  notes: string;
}

/** Shared fields of a create request or the changed fields of an update. */
export function validateKeywordFields(input: Record<string, unknown>, partial: boolean): Partial<KeywordFields> {
  const known = new Set(["type", "target", "group", "status", "notes"]);
  for (const k of Object.keys(input)) if (!known.has(k)) throw new MetadataValidationError(k, `Unknown field ${k}`);
  const out: Partial<KeywordFields> = {};
  const has = (k: string) => !partial || input[k] !== undefined;
  if (has("type")) out.type = oneOf(input.type, KEYWORD_TYPES, "type", partial ? undefined : "secondary");
  if (has("target")) out.target = oneOf(input.target, KEYWORD_TARGETS.map((t) => t.id), "target", partial ? undefined : "/");
  if (has("group")) out.group = plain(input.group, "group", 60);
  if (has("status")) out.status = oneOf(input.status, KEYWORD_STATUSES, "status", partial ? undefined : "not-started");
  if (has("notes")) out.notes = plain(input.notes, "notes", 1000);
  return out;
}

/** Validates the keyword list of a create request (pasted lists are split and de-duplicated). */
export function validateKeywordList(v: unknown): string[] {
  const raw = typeof v === "string" ? splitKeywordText(v) : Array.isArray(v) ? v : null;
  if (!raw) throw new MetadataValidationError("keywords", "Must be a list of keywords");
  if (raw.some((k) => typeof k !== "string")) throw new MetadataValidationError("keywords", "Every keyword must be text");
  const list = dedupeKeywords(raw as string[]);
  if (!list.length) throw new MetadataValidationError("keywords", "Add at least one keyword");
  if (list.length > MAX_KEYWORDS_PER_REQUEST) throw new MetadataValidationError("keywords", `At most ${MAX_KEYWORDS_PER_REQUEST} keywords at once`);
  for (const k of list) {
    if (UNSAFE.test(k)) throw new MetadataValidationError("keywords", `"${k.slice(0, 40)}": angle brackets and control characters are not allowed`);
    if (k.length > MAX_KEYWORD_LENGTH) throw new MetadataValidationError("keywords", `"${k.slice(0, 40)}…" is longer than ${MAX_KEYWORD_LENGTH} characters`);
  }
  return list;
}

export interface KeywordRow {
  id: string;
  keyword: string;
  normalized: string;
  type: KeywordType;
  target: string;
  group: string;
  status: KeywordStatus;
  notes: string;
  updatedBy: string;
  updatedAt: string;
}

export interface KeywordOverlap {
  normalized: string;
  keyword: string;
  targets: string[];
  /** more than one page/section treats it as its primary keyword */
  primaryConflict: boolean;
}

/** Keywords assigned to more than one page or section (possible cannibalisation). */
export function keywordOverlaps(rows: readonly Pick<KeywordRow, "keyword" | "normalized" | "target" | "type">[]): KeywordOverlap[] {
  const by = new Map<string, Pick<KeywordRow, "keyword" | "normalized" | "target" | "type">[]>();
  for (const r of rows) by.set(r.normalized, [...(by.get(r.normalized) ?? []), r]);
  const out: KeywordOverlap[] = [];
  for (const [normalized, list] of by) {
    const targets = [...new Set(list.map((r) => r.target))];
    if (targets.length < 2) continue;
    out.push({ normalized, keyword: list[0].keyword, targets, primaryConflict: list.filter((r) => r.type === "primary").length > 1 });
  }
  return out.sort((a, b) => Number(b.primaryConflict) - Number(a.primaryConflict) || a.normalized.localeCompare(b.normalized));
}
