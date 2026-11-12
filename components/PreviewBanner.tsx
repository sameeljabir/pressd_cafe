"use client";

import { useState } from "react";

/** Shown only in an SEO Studio preview: this page includes unpublished drafts. */
export default function PreviewBanner() {
  const [leaving, setLeaving] = useState(false);
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        display: "flex",
        gap: 12,
        alignItems: "center",
        maxWidth: "calc(100vw - 32px)",
        padding: "8px 10px 8px 14px",
        borderRadius: 999,
        background: "#1d1a16",
        color: "#fff",
        font: "600 13px/1.3 system-ui, sans-serif",
        boxShadow: "0 6px 24px rgba(0,0,0,.25)",
      }}
    >
      <span>Preview — includes unpublished drafts</span>
      <button
        type="button"
        disabled={leaving}
        onClick={async () => {
          setLeaving(true);
          await fetch("/api/admin/preview/exit", { method: "POST" }).catch(() => {});
          location.reload();
        }}
        style={{ border: 0, borderRadius: 999, padding: "6px 12px", background: "#fbb019", color: "#1d1a16", font: "inherit", cursor: "pointer" }}
      >
        {leaving ? "Leaving…" : "Exit preview"}
      </button>
    </div>
  );
}
