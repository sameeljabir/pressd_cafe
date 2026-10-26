"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "mobile" | "desktop" | "hidden";
const SIZES = { mobile: { w: 390, h: 760 }, desktop: { w: 1280, h: 800 } };

/** The published website in an iframe, scaled to fit, with phone/desktop/hide and Reload. */
export default function LivePreview({ anchor = "" }: { anchor?: string }) {
  const [mode, setMode] = useState<Mode>("mobile");
  const [reload, setReload] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // The site shows one section ("view") at a time, chosen by the URL hash
  // (components/navigation/SectionNavContext.tsx). Switch it without a
  // fragment navigation, which would also scroll this admin page.
  const jump = () => {
    const w = frameRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (!w || w.location.pathname !== "/") return;
    w.history.replaceState(null, "", anchor || "#home");
    w.dispatchEvent(new w.HashChangeEvent("hashchange"));
  };
  const onLoad = () => {
    const w = frameRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (!w) return;
    // The site's carousels call scrollIntoView, which would also scroll this
    // admin page around the frame. Keep those scrolls inside the frame.
    w.Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      const o = typeof arg === "object" && arg ? arg : {};
      const r = this.getBoundingClientRect();
      let box = this.parentElement;
      while (box && box !== w.document.body) {
        const cs = w.getComputedStyle(box);
        if (/auto|scroll/.test(cs.overflowX + cs.overflowY) && (box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight)) break;
        box = box.parentElement;
      }
      if (box && box !== w.document.body) {
        const b = box.getBoundingClientRect();
        box.scrollTo({ left: box.scrollLeft + r.left - b.left - (o.inline === "center" ? (b.width - r.width) / 2 : 0), behavior: o.behavior });
      } else w.scrollTo({ top: r.top + w.scrollY, behavior: o.behavior });
    };
    // After the site's own load handling (components/ScrollInit.tsx).
    w.setTimeout(jump, 1400);
  };
  useEffect(jump, [anchor]); // jump when the section changes (the frame stays loaded)
  useEffect(() => {
    if (mode === "hidden" || !boxRef.current) return;
    const el = boxRef.current;
    const fit = () => setScale(Math.min(1, el.clientWidth / SIZES[mode].w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const size = mode === "hidden" ? null : SIZES[mode];
  return (
    <section className="live-preview" aria-label="Live website preview">
      <div className="live-head">
        <span className="small faint">LIVE WEBSITE (PUBLISHED)</span>
        <span className="seg" role="group" aria-label="Preview size">
          {(["mobile", "desktop", "hidden"] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "mobile" ? "Phone" : m === "desktop" ? "Desktop" : "Hide"}
            </button>
          ))}
        </span>
        {size ? <button type="button" className="btn btn-sm" onClick={() => setReload((n) => n + 1)}>Reload</button> : null}
      </div>
      {size ? (
        <div ref={boxRef} className="live-box-wrap">
          <div className="live-box" style={{ width: size.w * scale, height: size.h * scale }}>
            <iframe
              key={`${reload}-${mode}`}
              ref={frameRef}
              title="Published website preview"
              src="/"
              onLoad={onLoad}
              style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}
            />
          </div>
        </div>
      ) : null}
      <p className="small faint">Shows what is published. Saved drafts appear here only after Confirm &amp; Publish.</p>
    </section>
  );
}
