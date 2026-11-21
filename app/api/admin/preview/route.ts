import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { requireApi } from "@/lib/seo/auth/guard";
import { getDb } from "@/lib/seo/server";
import { isPostId } from "@/lib/blog/post";
import { getPost } from "@/lib/blog/service";

// Opens the public page with saved drafts (SEO Studio preview). Requires a
// signed-in SEO Studio user; the page itself checks the session again before
// showing any draft, so the Draft Mode cookie alone never reveals drafts.
// Only fixed section anchors are accepted (no open redirect).
const SECTIONS = new Set(["home", "about", "visit", "menu"]);

export async function GET(req: Request) {
  const viewer = await requireApi(req, "reports:read");
  if (viewer instanceof NextResponse) return viewer;
  const params = new URL(req.url).searchParams;
  const section = params.get("section") ?? "home";
  // ?post=<id>: open that blog post's saved draft (or its published version) at /blog/<slug>.
  let target = `/${SECTIONS.has(section) ? `#${section}` : ""}`;
  const postId = params.get("post");
  if (postId !== null) {
    if (!isPostId(postId)) return NextResponse.json({ error: { code: "invalid", message: "Unknown post" } }, { status: 400 });
    const p = await getPost(await getDb(), postId);
    const slug = ((p?.draft ?? p?.live)?.fields as { slug?: string } | undefined)?.slug;
    if (!slug) return NextResponse.json({ error: { code: "not_found", message: "Post not found" } }, { status: 404 });
    target = `/blog/${slug}`;
  }
  (await draftMode()).enable();
  const res = NextResponse.redirect(new URL(target, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
