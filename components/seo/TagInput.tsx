"use client";

import { useId, useState } from "react";
import { dedupeKeywords, splitKeywordText } from "@/lib/seo/core/metadata";

interface Props {
  id?: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null;
}

/**
 * Chip-style list input. Enter or comma adds what was typed; pasting a list
 * separated by commas, semicolons or new lines adds every entry. Repeats are
 * ignored case-insensitively and reported, so nothing is dropped silently.
 */
export default function TagInput({ id, label, hint, value, onChange, max = 20, maxLength = 60, disabled, placeholder, error }: Props) {
  const auto = useId();
  const inputId = id ?? `tags-${auto}`;
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function add(raw: string[]) {
    const incoming = raw.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!incoming.length) return;
    const tooLong = incoming.filter((s) => s.length > maxLength);
    const usable = incoming.filter((s) => s.length <= maxLength);
    const merged = dedupeKeywords([...value, ...usable]);
    const dupes = value.length + usable.length - merged.length;
    const kept = merged.slice(0, max);
    const overflow = merged.length - kept.length;
    onChange(kept);
    const parts = [
      dupes > 0 ? `${dupes} already in the list` : "",
      tooLong.length ? `${tooLong.length} longer than ${maxLength} characters` : "",
      overflow > 0 ? `${overflow} over the limit of ${max}` : "",
    ].filter(Boolean);
    setNote(parts.length ? `Skipped: ${parts.join(", ")}.` : null);
  }

  function commit() {
    if (!draft.trim()) return;
    add(splitKeywordText(draft));
    setDraft("");
  }

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {hint ? <span className="hint" id={`${inputId}-hint`}>{hint}</span> : null}
      <div className={`tag-input ${disabled ? "is-disabled" : ""} ${error ? "is-invalid" : ""}`} onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        <ul className="tag-chips" aria-label={`${label}: ${value.length} added`}>
          {value.map((t, i) => (
            <li key={`${t}-${i}`} className="tag-chip">
              <span>{t}</span>
              {!disabled ? (
                <button type="button" aria-label={`Remove ${t}`} onClick={() => { onChange(value.filter((_, j) => j !== i)); setNote(null); }}>×</button>
              ) : null}
            </li>
          ))}
        </ul>
        <input
          id={inputId}
          className="tag-input-field"
          value={draft}
          disabled={disabled || value.length >= max}
          placeholder={value.length >= max ? `Limit of ${max} reached` : placeholder ?? "Type and press Enter, or paste a comma-separated list"}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;\n]/.test(v)) {
              add(splitKeywordText(v));
              setDraft("");
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!/[,;\n]/.test(text)) return;
            e.preventDefault();
            add(splitKeywordText(draft + text));
            setDraft("");
          }}
          onBlur={commit}
        />
      </div>
      <span className="small faint">{value.length} / {max}</span>
      {note ? <span className="field-warn" role="status">{note}</span> : null}
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}
