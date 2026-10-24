"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client";

const T_FIELDS = [
  ["titleMin", "Title min characters"],
  ["titleMax", "Title max characters"],
  ["descriptionMin", "Description min characters"],
  ["descriptionMax", "Description max characters"],
] as const;


export default function SettingsForm({ thresholds, canEdit }: { thresholds: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const [t, setT] = useState(thresholds);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const dirty = JSON.stringify(t) !== JSON.stringify(thresholds);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await api("PUT", "/api/admin/seo/settings", { thresholds: t });
    setMsg(r.ok ? { text: "Settings saved." } : { text: r.error ?? "Save failed", error: true });
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section" style={{ marginBottom: 8 }}>Length guidance</legend>
        <p className="small faint" style={{ marginTop: 0 }}>Used by the editor&apos;s length meters and publish warnings. Editorial guidance only — Google publishes no fixed limits.</p>
        <div className="form-grid">
          {T_FIELDS.map(([k, label]) => (
            <label className="field" key={k}><span>{label}</span><input className="input" type="number" inputMode="numeric" value={t[k]} onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })} /></label>
          ))}
        </div>
        {canEdit ? (
          <div className="toolbar" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" type="submit" disabled={!dirty}>Save settings</button>
            {dirty ? <span className="small" style={{ color: "var(--amber)" }}>Unsaved changes</span> : null}
          </div>
        ) : <p className="hint">Only admins can change settings.</p>}
      </fieldset>
      {msg ? <p className="status-line" role={msg.error ? "alert" : "status"}>{msg.text}</p> : null}
    </form>
  );
}
