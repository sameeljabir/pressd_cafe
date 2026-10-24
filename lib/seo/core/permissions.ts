// Roles and permissions for the SEO dashboard. Pure module (no Next/React
// imports) so it can be unit-tested with `node --test`.
//
// Access is granted only to accounts listed in SEO_ADMIN_USERS, each with a role
// and a scrypt password hash (generate with `npm run seo:hash-password`):
//   SEO_ADMIN_USERS="owner@pressdcafe.ae:admin:scrypt.…, seo@agency.com:publisher:scrypt.…"
// Roles are re-resolved from that list on every request, so removing an
// address (and redeploying) revokes access even for an existing session.

export const ROLES = ["viewer", "editor", "publisher", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "reports:read" // view audits, Search Console, performance, pages, tasks
  | "reports:export" // download CSV exports
  | "audit:run" // start / continue / cancel crawls, recheck issues
  | "issues:update" // change issue status (assign, fix, ignore)
  | "tasks:write" // create and update SEO tasks
  | "performance:run" // trigger PageSpeed Insights tests
  | "metadata:draft" // save metadata drafts (not live)
  | "metadata:publish" // publish or roll back page metadata
  | "settings:manage" // audit thresholds and dashboard settings
  | "google:connect"; // connect / disconnect Search Console

const GRANTS: Record<Role, readonly Permission[]> = {
  viewer: ["reports:read", "reports:export"],
  editor: ["reports:read", "reports:export", "audit:run", "issues:update", "tasks:write", "performance:run", "metadata:draft"],
  publisher: [
    "reports:read",
    "reports:export",
    "audit:run",
    "issues:update",
    "tasks:write",
    "performance:run",
    "metadata:draft",
    "metadata:publish",
  ],
  admin: [
    "reports:read",
    "reports:export",
    "audit:run",
    "issues:update",
    "tasks:write",
    "performance:run",
    "metadata:draft",
    "metadata:publish",
    "settings:manage",
    "google:connect",
  ],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && GRANTS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return GRANTS[role];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

const EMAIL_RE = /^[^\s@,:]+@[^\s@,:]+\.[^\s@,:]+$/;

export interface AllowlistResult {
  users: Map<string, Role>;
  /** scrypt password hashes by email (users without one cannot sign in) */
  hashes: Map<string, string>;
  errors: string[];
}

/** Parses "email:role[:hash], …". Invalid entries are reported, never guessed. */
export function parseAllowlist(raw: string | undefined | null): AllowlistResult {
  const users = new Map<string, Role>();
  const hashes = new Map<string, string>();
  const errors: string[] = [];
  for (const part of (raw ?? "").split(/[,;\n]/)) {
    const entry = part.trim();
    if (!entry) continue;
    const [emailPart = "", rolePart = "", ...rest] = entry.split(":");
    const email = emailPart.trim().toLowerCase();
    const role = rolePart.trim().toLowerCase();
    const hash = rest.join(":").trim();
    if (!EMAIL_RE.test(email)) {
      errors.push(`Invalid email in SEO_ADMIN_USERS entry "${entry}"`);
      continue;
    }
    if (!isRole(role)) {
      errors.push(`Missing or unknown role for ${email} (use one of: ${ROLES.join(", ")})`);
      continue;
    }
    users.set(email, role);
    if (hash) {
      if (/^scrypt\.\d+\.\d+\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(hash)) hashes.set(email, hash);
      else errors.push(`Password hash for ${email} is not in the expected format (use npm run seo:hash-password)`);
    }
  }
  return { users, hashes, errors };
}

export function roleFor(email: string | null | undefined, allowlist: Map<string, Role>): Role | null {
  if (!email) return null;
  return allowlist.get(email.trim().toLowerCase()) ?? null;
}
