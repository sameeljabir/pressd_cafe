// Password hashing for SEO Studio sign-in (scrypt, node:crypto — no dependencies).
// Stored format: scrypt.N.r.p.<salt base64url>.<hash base64url>
// (dots, not $, so the value survives variable expansion in .env files)
// Generate a hash with: npm run seo:hash-password

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_HASH_RE = /^scrypt\.\d+\.\d+\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join(".");
}

export function isPasswordHash(s: string): boolean {
  return PASSWORD_HASH_RE.test(s);
}

// Used when the email is unknown, so failed sign-ins take the same time either way.
const DUMMY_SALT = randomBytes(16);

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !isPasswordHash(stored)) {
    await scrypt(password, DUMMY_SALT, N, R, P);
    return false;
  }
  const [, n, r, p, salt, hash] = stored.split(".");
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
