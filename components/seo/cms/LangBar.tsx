"use client";

import { LOCALES } from "@/lib/i18n/locales";

/** Language switcher with translation completeness (English is the source). */
export default function LangBar({ value, onChange, completeness }: { value: string; onChange: (code: string) => void; completeness: Record<string, number> }) {
  return (
    <div className="lang-bar" role="group" aria-label="Language being edited">
      {LOCALES.map((l) => {
        const pct = l.code === "en" ? null : completeness[l.code] ?? 0;
        return (
          <button key={l.code} type="button" className={value === l.code ? "on" : undefined} aria-pressed={value === l.code} onClick={() => onChange(l.code)} title={l.englishName}>
            {l.nativeName}
            {pct === null ? <span className="pct">source</span> : <span className={`pct${pct < 100 ? " low" : ""}`}>{pct}%</span>}
          </button>
        );
      })}
    </div>
  );
}
