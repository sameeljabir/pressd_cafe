// Email + password sign-in with lockout. Failed attempts are recorded in the
// admin log and counted over a sliding window, per email and per IP.

import type { Db, LogDoc } from "../db/mongo.ts";
import type { AllowlistResult, Role } from "../core/permissions.ts";
import { verifyPassword } from "../core/password.ts";

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILS_PER_EMAIL = 5;
export const MAX_FAILS_PER_IP = 20;

export type LoginResult = { ok: true; email: string; role: Role } | { ok: false; reason: "invalid" | "locked" };

async function recentFailures(db: Db, since: Date, by: { email?: string; ip?: string }) {
  const who = by.email !== undefined ? { target: by.email } : { "details.ip": by.ip ?? "" };
  return db.log.countDocuments({ action: "login_failed", at: { $gt: since }, ...who });
}

const record = (db: Db, entry: Omit<LogDoc, "_id" | "at">, at: Date) => db.log.insertOne({ ...entry, at });

export async function attemptLogin(
  db: Db,
  input: { email: string; password: string; ip: string },
  allow: AllowlistResult,
  now = new Date(),
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase().slice(0, 320);
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([recentFailures(db, since, { email }), recentFailures(db, since, { ip: input.ip })]);
  if (byEmail >= MAX_FAILS_PER_EMAIL || byIp >= MAX_FAILS_PER_IP) {
    await record(db, { actor: "anonymous", action: "login_locked", target: email, details: { ip: input.ip } }, now);
    return { ok: false, reason: "locked" };
  }
  const role = allow.users.get(email) ?? null;
  // verifyPassword does the same amount of work whether or not the account exists
  const valid = await verifyPassword(input.password.slice(0, 1024), role ? allow.hashes.get(email) : null);
  if (!role || !valid) {
    await record(db, { actor: "anonymous", action: "login_failed", target: email, details: { ip: input.ip } }, now);
    return { ok: false, reason: "invalid" };
  }
  await record(db, { actor: email, action: "login", target: null, details: { role, ip: input.ip } }, now);
  return { ok: true, email, role };
}
