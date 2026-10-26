"use client";

import { useEffect } from "react";

/** Every fresh page load begins scrolled to the top. The hash is left alone:
 *  it names the section being viewed, so a refresh or a shared link reopens it. */
export default function ScrollInit() {
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    const onLoad = () => {
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      setTimeout(() => {
        window.scrollTo(0, 0);
        root.style.scrollBehavior = previous;
      }, 1250);
    };
    if (document.readyState === "complete") onLoad();
    else addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}
