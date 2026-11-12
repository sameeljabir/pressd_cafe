import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

// Leaves the SEO Studio preview. Open to anyone (it only removes a cookie), so
// an expired session can always get back to the normal site.
export async function POST() {
  (await draftMode()).disable();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
