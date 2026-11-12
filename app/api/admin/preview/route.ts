import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { requireApi } from "@/lib/seo/auth/guard";

// Opens the public page with saved drafts (SEO Studio preview). Requires a
// signed-in SEO Studio user; the page itself checks the session again before
// showing any draft, so the Draft Mode cookie alone never reveals drafts.
// Only fixed section anchors are accepted (no open redirect).
const SECTIONS = new Set(["home", "about", "visit", "menu"]);

export async function GET(req: Request) {
  const viewer = await requireApi(req, "reports:read");
  if (viewer instanceof NextResponse) return viewer;
  const section = new URL(req.url).searchParams.get("section") ?? "home";
  (await draftMode()).enable();
  const res = NextResponse.redirect(new URL(`/${SECTIONS.has(section) ? `#${section}` : ""}`, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
