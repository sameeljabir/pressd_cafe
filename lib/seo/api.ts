import "server-only";
// Shared route-handler plumbing: auth + permission check, bounded JSON body,
// and error mapping that never leaks stack traces or internal messages.

import { NextResponse } from "next/server";
import type { Permission } from "./core/permissions.ts";
import { jsonError, requireApi, type Viewer } from "./auth/guard.ts";
import { DatabaseUnavailableError } from "./db/mongo.ts";
import { MetadataValidationError } from "./core/metadata.ts";
import { ConcurrentPublishError } from "./services/metadata.ts";
import { SettingsValidationError } from "./services/settings.ts";
import { NothingToPublishError } from "./services/docs.ts";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export async function readJson(req: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new BadRequest("Request body too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new BadRequest("Request body too large");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new BadRequest("Body must be a JSON object");
  }
}

export class BadRequest extends Error {}

export function handle<C = unknown>(permission: Permission, fn: (req: Request, viewer: Viewer, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const viewer = await requireApi(req, permission);
    if (viewer instanceof NextResponse) return viewer;
    try {
      return await fn(req, viewer, ctx);
    } catch (e) {
      if (e instanceof BadRequest || e instanceof SettingsValidationError) return jsonError(400, "invalid", e.message);
      if (e instanceof MetadataValidationError) return NextResponse.json({ error: { code: "invalid", message: e.message, field: e.field } }, { status: 400 });
      if (e instanceof NothingToPublishError) return jsonError(409, "nothing_to_publish", e.message);
      if (e instanceof ConcurrentPublishError) return jsonError(409, "conflict", e.message);
      if (e instanceof DatabaseUnavailableError) return jsonError(503, "database_unavailable", "The dashboard database is not configured (MONGODB_URI).");
      // Name only: driver messages can include host names; the client gets a generic message.
      console.error("[seo] unhandled API error", req.method, new URL(req.url).pathname, e instanceof Error ? e.name : typeof e);
      return jsonError(500, "internal", "Something went wrong. The error was logged.");
    }
  };
}
