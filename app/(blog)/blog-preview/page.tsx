import type { Metadata } from "next";
import PreviewFrame from "./PreviewFrame";

// Target of the dashboard's live preview iframe. It holds no data: it renders
// only what the editor (same origin) sends it with postMessage, so it can never
// reveal a saved or unpublished article on its own.
export const metadata: Metadata = { title: "Article preview", robots: { index: false, follow: false } };

export default function BlogPreviewPage() {
  return <PreviewFrame />;
}
