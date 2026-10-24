import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sealSession, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/seo/auth/session";
import { allowlist, sessionSecret } from "@/lib/seo/env";
import { getDb } from "@/lib/seo/server";
import { attemptLogin } from "@/lib/seo/services/login";

// Email + password sign-in (form POST from /admin/login).
export async function POST(req: Request) {
  const back = (error: string) => NextResponse.redirect(new URL(`/admin/login?error=${error}`, req.url), 303);
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return back("bad_origin");

  const secret = sessionSecret();
  if (!secret) return back("not_configured");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return back("invalid");
  }
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return back("invalid");

  let db;
  try {
    db = await getDb();
  } catch {
    return back("database_unavailable");
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const result = await attemptLogin(db, { email, password, ip }, allowlist());
  if (!result.ok) return back(result.reason);

  (await cookies()).set(SESSION_COOKIE, await sealSession({ email: result.email, name: null }, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return NextResponse.redirect(new URL("/admin/seo", req.url), 303);
}
