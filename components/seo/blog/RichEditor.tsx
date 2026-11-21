"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { safeHref, type RichNode } from "@/lib/blog/content";
import MediaPicker from "./MediaPicker";

interface Props {
  value: RichNode;
  onChange: (doc: RichNode) => void;
  disabled?: boolean;
  canUpload: boolean;
}

/**
 * Article body editor. The schema is limited to what lib/blog/content.ts
 * accepts (H2–H6, paragraphs, bold/italic/underline, links, lists, quotes,
 * images with alt + caption, tables, alignment, divider); the server
 * validates the same rules again on save.
 */
export default function RichEditor({ value, onChange, disabled, canUpload }: Props) {
  const [picker, setPicker] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4, 5, 6] },
        code: false,
        codeBlock: false,
        strike: false,
        link: { openOnClick: false, autolink: true, protocols: ["mailto", "tel"], HTMLAttributes: { rel: "noopener noreferrer", target: null }, isAllowedUri: (url) => !!safeHref(url) },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichNode),
    editorProps: { attributes: { class: "rte-content blog-body", "aria-label": "Article body", role: "textbox", "aria-multiline": "true" } },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return <div className="rte rte-loading" aria-busy="true">Loading editor…</div>;
  return (
    <div className="rte">
      <Toolbar editor={editor} disabled={!!disabled} onImage={() => setPicker(true)} />
      <ImageBar editor={editor} />
      <EditorContent editor={editor} />
      <MediaPicker
        open={picker}
        onClose={() => setPicker(false)}
        canUpload={canUpload}
        title="Insert an image"
        onPick={(src) => {
          const alt = window.prompt("Describe the image (alt text) — what someone who can't see it should know:", "") ?? "";
          const caption = window.prompt("Caption shown under the image (optional):", "") ?? "";
          editor.chain().focus().setImage({ src, alt: alt.trim(), title: caption.trim() || undefined }).run();
        }}
      />
    </div>
  );
}

function Btn({ on, label, title, run, dis, disabled }: { on?: boolean; label: string; title: string; run: () => void; dis?: boolean; disabled: boolean }) {
  return (
    <button type="button" className={`rte-btn ${on ? "on" : ""}`} aria-pressed={on === undefined ? undefined : on} title={title} aria-label={title} disabled={disabled || dis} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
}

function Toolbar({ editor, disabled, onImage }: { editor: Editor; disabled: boolean; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      table: e.isActive("table"),
      level: ([2, 3, 4, 5, 6] as const).find((l) => e.isActive("heading", { level: l })) ?? 0,
      align: (["center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  function link() {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const input = window.prompt("Link address — https://…, a page on this site like /blog/… or /#menu, mailto: or tel:. Leave empty to remove the link.", prev);
    if (input === null) return;
    if (!input.trim()) return void c().extendMarkRange("link").unsetLink().run();
    const href = safeHref(input.trim());
    if (!href) return void window.alert("That link isn't allowed. Use https://…, /path, #anchor, mailto: or tel:.");
    c().extendMarkRange("link").setLink({ href }).run();
  }
  return (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
      <Btn disabled={disabled} label="↶" title="Undo" run={() => c().undo().run()} dis={!s?.canUndo} />
      <Btn disabled={disabled} label="↷" title="Redo" run={() => c().redo().run()} dis={!s?.canRedo} />
      <span className="rte-sep" />
      <select
        className="rte-select"
        aria-label="Text style"
        disabled={disabled}
        value={s?.level ?? 0}
        onChange={(e) => {
          const l = Number(e.target.value);
          if (l) c().setHeading({ level: l as 2 | 3 | 4 | 5 | 6 }).run();
          else c().setParagraph().run();
        }}
      >
        <option value={0}>Paragraph</option>
        {[2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>Heading {l}</option>)}
      </select>
      <span className="rte-sep" />
      <Btn disabled={disabled} on={s?.bold} label="B" title="Bold" run={() => c().toggleBold().run()} />
      <Btn disabled={disabled} on={s?.italic} label="I" title="Italic" run={() => c().toggleItalic().run()} />
      <Btn disabled={disabled} on={s?.underline} label="U" title="Underline" run={() => c().toggleUnderline().run()} />
      <Btn disabled={disabled} on={s?.link} label="🔗" title="Link" run={link} />
      <span className="rte-sep" />
      <Btn disabled={disabled} on={s?.bullet} label="• List" title="Bulleted list" run={() => c().toggleBulletList().run()} />
      <Btn disabled={disabled} on={s?.ordered} label="1. List" title="Numbered list" run={() => c().toggleOrderedList().run()} />
      <Btn disabled={disabled} on={s?.quote} label="❝" title="Quote" run={() => c().toggleBlockquote().run()} />
      <Btn disabled={disabled} label="―" title="Divider" run={() => c().setHorizontalRule().run()} />
      <span className="rte-sep" />
      {(["left", "center", "right", "justify"] as const).map((a) => (
        <Btn disabled={disabled} key={a} on={s?.align === a} label={{ left: "⇤", center: "↔", right: "⇥", justify: "☰" }[a]} title={`Align ${a}`} run={() => c().setTextAlign(a).run()} />
      ))}
      <span className="rte-sep" />
      <Btn disabled={disabled} label="🖼 Image" title="Insert image" run={onImage} />
      {!s?.table ? (
        <Btn disabled={disabled} label="▦ Table" title="Insert table" run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      ) : (
        <>
          <Btn disabled={disabled} label="+Row" title="Add row below" run={() => c().addRowAfter().run()} />
          <Btn disabled={disabled} label="+Col" title="Add column right" run={() => c().addColumnAfter().run()} />
          <Btn disabled={disabled} label="−Row" title="Delete row" run={() => c().deleteRow().run()} />
          <Btn disabled={disabled} label="−Col" title="Delete column" run={() => c().deleteColumn().run()} />
          <Btn disabled={disabled} label="✕ Table" title="Delete table" run={() => c().deleteTable().run()} />
        </>
      )}
    </div>
  );
}

/** Alt text and caption of the selected image. */
function ImageBar({ editor }: { editor: Editor }) {
  const img = useEditorState({ editor, selector: ({ editor: e }) => (e.isActive("image") ? (e.getAttributes("image") as { src: string; alt?: string; title?: string }) : null) });
  if (!img) return null;
  return (
    <div className="rte-imagebar">
      <span className="small">Selected image</span>
      <label className="field grow"><span>Alt text</span>
        <input className="input input-sm" value={img.alt ?? ""} maxLength={250} onChange={(e) => editor.chain().updateAttributes("image", { alt: e.target.value }).run()} aria-invalid={!img.alt ? true : undefined} />
      </label>
      <label className="field grow"><span>Caption</span>
        <input className="input input-sm" value={img.title ?? ""} maxLength={300} onChange={(e) => editor.chain().updateAttributes("image", { title: e.target.value || null }).run()} />
      </label>
      {!img.alt ? <span className="field-error">Alt text is missing</span> : null}
    </div>
  );
}
