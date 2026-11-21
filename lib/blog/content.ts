// Article body: a strict allow-list over the editor's JSON (TipTap/ProseMirror
// shape). Pure module, shared by the API (validation), the public renderer and
// the dashboard. Only the nodes, marks and attributes listed here are kept;
// anything else is rejected, so stored content can never carry raw HTML,
// scripts, event handlers, styles or unsafe links.

export interface RichMark {
  type: "bold" | "italic" | "underline" | "link";
  attrs?: { href: string };
}

export interface RichNode {
  type: string;
  attrs?: Record<string, string | number | null>;
  content?: RichNode[];
  marks?: RichMark[];
  text?: string;
}

export class ContentValidationError extends Error {
  readonly field: string;
  constructor(message: string, field = "content") {
    super(message);
    this.field = field;
  }
}

export const MAX_CONTENT_BYTES = 600_000;
const MAX_NODES = 20_000;
const MAX_DEPTH = 24;
const ALIGNS = new Set(["left", "center", "right", "justify"]);
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Image sources an article may use: the site's image library (/assets/…) or uploaded media (/media/<id>.<ext>). */
export const MEDIA_SRC = /^\/media\/[0-9a-f]{24}\.(jpg|png|webp|gif)$/;
export function isAllowedImageSrc(src: unknown, library: ReadonlySet<string>): src is string {
  return typeof src === "string" && (MEDIA_SRC.test(src) || library.has(src));
}

/**
 * Links: https/http URLs, site-relative paths (/…), in-page anchors (#…),
 * mailto: and tel:. Everything else (javascript:, data:, protocol-relative //…) is refused.
 */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  // Phone numbers are often written with spaces: keep only + and digits.
  if (/^tel:\+?[0-9 ()-]{3,30}$/i.test(href)) return `tel:${href.slice(4).replace(/[^\d+]/g, "")}`;
  if (!href || href.length > 2000 || /[\s<>"'`]/.test(href)) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("#")) return /^#[A-Za-z0-9_-]{1,80}$/.test(href) ? href : null;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(href)) return href;
  try {
    const u = new URL(href);
    if ((u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password) return u.toString();
  } catch {
    /* not a URL */
  }
  return null;
}

export function isInternalHref(href: string, siteHost: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    return new URL(href).hostname.replace(/^www\./, "") === siteHost.replace(/^www\./, "");
  } catch {
    return false;
  }
}

type Rule = { children: "block" | "inline" | "listItem" | "row" | "cell" | "none" | "blockNoTable"; attrs: (a: Record<string, unknown>, ctx: Ctx) => Record<string, string | number | null> | undefined };
interface Ctx {
  library: ReadonlySet<string>;
  count: number;
}

const align = (a: Record<string, unknown>) => (typeof a.textAlign === "string" && ALIGNS.has(a.textAlign) && a.textAlign !== "left" ? { textAlign: a.textAlign } : undefined);
const shortText = (v: unknown, max: number, field: string) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ContentValidationError(`${field} must be text`);
  if (UNSAFE_TEXT.test(v) || /[<>]/.test(v)) throw new ContentValidationError(`${field}: angle brackets and control characters are not allowed`);
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length > max) throw new ContentValidationError(`${field}: at most ${max} characters`);
  return s || null;
};
const span = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 20 ? (v as number) : 1);

const BLOCK_RULES: Record<string, Rule> = {
  paragraph: { children: "inline", attrs: align },
  heading: {
    children: "inline",
    attrs: (a) => {
      const level = Number(a.level);
      if (![2, 3, 4, 5, 6].includes(level)) throw new ContentValidationError("Headings must be H2–H6 (the article title is the page's only H1)");
      return { level, ...(align(a) ?? {}) };
    },
  },
  blockquote: { children: "blockNoTable", attrs: () => undefined },
  bulletList: { children: "listItem", attrs: () => undefined },
  orderedList: {
    children: "listItem",
    attrs: (a) => {
      const start = Number(a.start ?? 1);
      return Number.isInteger(start) && start > 1 && start < 100_000 ? { start } : undefined;
    },
  },
  horizontalRule: { children: "none", attrs: () => undefined },
  image: {
    children: "none",
    attrs: (a, ctx) => {
      if (!isAllowedImageSrc(a.src, ctx.library)) throw new ContentValidationError("Images must come from the image library or an upload");
      return { src: a.src as string, alt: shortText(a.alt, 250, "Image alt text") ?? "", title: shortText(a.title, 300, "Image caption") };
    },
  },
  table: { children: "row", attrs: () => undefined },
};

const CHILD_RULES: Record<string, Rule> = {
  listItem: { children: "blockNoTable", attrs: () => undefined },
  tableRow: { children: "cell", attrs: () => undefined },
  tableCell: { children: "blockNoTable", attrs: (a) => ({ colspan: span(a.colspan), rowspan: span(a.rowspan) }) },
  tableHeader: { children: "blockNoTable", attrs: (a) => ({ colspan: span(a.colspan), rowspan: span(a.rowspan) }) },
};

function cleanMarks(marks: unknown): RichMark[] | undefined {
  if (marks === undefined) return undefined;
  if (!Array.isArray(marks)) throw new ContentValidationError("Invalid text formatting");
  const out: RichMark[] = [];
  for (const m of marks) {
    const type = (m as { type?: unknown })?.type;
    if (type === "bold" || type === "italic" || type === "underline") out.push({ type });
    else if (type === "link") {
      const href = safeHref((m as { attrs?: { href?: unknown } }).attrs?.href);
      if (!href) throw new ContentValidationError(`Link "${String((m as { attrs?: { href?: unknown } }).attrs?.href ?? "").slice(0, 60)}" is not allowed — use https://, a /path on this site, mailto: or tel:`);
      out.push({ type: "link", attrs: { href } });
    } else throw new ContentValidationError(`Formatting "${String(type)}" is not supported`);
  }
  return out.length ? out : undefined;
}

function cleanNode(raw: unknown, allowed: Rule["children"], ctx: Ctx, depth: number): RichNode {
  if (depth > MAX_DEPTH) throw new ContentValidationError("Content is nested too deeply");
  if (++ctx.count > MAX_NODES) throw new ContentValidationError("Article is too long");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ContentValidationError("Invalid content");
  const n = raw as Record<string, unknown>;
  const type = n.type;
  if (typeof type !== "string") throw new ContentValidationError("Invalid content");

  if (allowed === "inline") {
    if (type === "text") {
      if (typeof n.text !== "string" || !n.text) throw new ContentValidationError("Invalid text");
      if (UNSAFE_TEXT.test(n.text)) throw new ContentValidationError("Control characters are not allowed");
      const marks = cleanMarks(n.marks);
      return marks ? { type, text: n.text, marks } : { type, text: n.text };
    }
    if (type === "hardBreak") return { type };
    throw new ContentValidationError(`"${type}" cannot appear inside a paragraph or heading`);
  }

  const rule =
    allowed === "block" || allowed === "blockNoTable"
      ? type === "table" && allowed === "blockNoTable"
        ? undefined
        : BLOCK_RULES[type]
      : allowed === "listItem"
        ? type === "listItem" ? CHILD_RULES.listItem : undefined
        : allowed === "row"
          ? type === "tableRow" ? CHILD_RULES.tableRow : undefined
          : allowed === "cell"
            ? type === "tableCell" || type === "tableHeader" ? CHILD_RULES[type] : undefined
            : undefined;
  if (!rule) throw new ContentValidationError(`"${type}" is not allowed here`);
  const attrs = rule.attrs((n.attrs as Record<string, unknown> | undefined) ?? {}, ctx);
  const out: RichNode = { type };
  if (attrs && Object.keys(attrs).length) out.attrs = attrs;
  if (rule.children !== "none") {
    const kids = n.content === undefined ? [] : n.content;
    if (!Array.isArray(kids)) throw new ContentValidationError("Invalid content");
    const content = kids.map((k) => cleanNode(k, rule.children, ctx, depth + 1));
    if (content.length) out.content = content;
    else if (rule.children !== "inline") out.content = rule.children === "cell" || rule.children === "row" || rule.children === "listItem" ? [] : [{ type: "paragraph" }];
  }
  if ((type === "bulletList" || type === "orderedList") && !out.content?.length) throw new ContentValidationError("Empty list");
  if (type === "table" && !out.content?.length) throw new ContentValidationError("Empty table");
  return out;
}

/** Validates and normalises an article body. `library` = allowed /assets/… image paths. */
export function validateContent(raw: unknown, library: ReadonlySet<string>): RichNode {
  if (raw === undefined || raw === null) return emptyDoc();
  if (JSON.stringify(raw).length > MAX_CONTENT_BYTES) throw new ContentValidationError(`Article body is larger than ${Math.round(MAX_CONTENT_BYTES / 1000)} KB`);
  const d = raw as Record<string, unknown>;
  if (d.type !== "doc") throw new ContentValidationError("Invalid content");
  const kids = d.content === undefined ? [] : d.content;
  if (!Array.isArray(kids)) throw new ContentValidationError("Invalid content");
  const ctx: Ctx = { library, count: 0 };
  const content = kids.map((k) => cleanNode(k, "block", ctx, 1));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export const emptyDoc = (): RichNode => ({ type: "doc", content: [{ type: "paragraph" }] });

// ---------------------------------------------------------------- facts used by analysis, reading time and previews

export interface ContentFacts {
  text: string;
  words: number;
  headings: { level: number; text: string }[];
  images: { src: string; alt: string; caption: string | null }[];
  links: { href: string; text: string }[];
  paragraphs: string[];
}

function inlineText(n: RichNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return " ";
  return (n.content ?? []).map(inlineText).join("");
}

export function contentFacts(doc: RichNode | null | undefined): ContentFacts {
  const f: ContentFacts = { text: "", words: 0, headings: [], images: [], links: [], paragraphs: [] };
  const parts: string[] = [];
  const walk = (n: RichNode) => {
    if (n.type === "heading") f.headings.push({ level: Number(n.attrs?.level ?? 2), text: inlineText(n).trim() });
    if (n.type === "paragraph") {
      const t = inlineText(n).trim();
      if (t) f.paragraphs.push(t);
    }
    if (n.type === "image") f.images.push({ src: String(n.attrs?.src ?? ""), alt: String(n.attrs?.alt ?? ""), caption: (n.attrs?.title as string | null) ?? null });
    if (n.type === "text") {
      parts.push(n.text ?? "");
      const link = n.marks?.find((m) => m.type === "link");
      if (link?.attrs?.href) f.links.push({ href: link.attrs.href, text: n.text ?? "" });
    }
    if (n.type === "paragraph" || n.type === "heading" || n.type === "listItem" || n.type === "tableCell" || n.type === "tableHeader") parts.push(" ");
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  f.text = parts.join("").replace(/\s+/g, " ").trim();
  f.words = f.text ? f.text.split(" ").length : 0;
  return f;
}

/** Minutes at ~200 words per minute (at least 1). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

/** Stable, readable id for a heading anchor. */
export function headingId(text: string, used: Map<string, number>): string {
  const base = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n ? `${base}-${n + 1}` : base;
}
