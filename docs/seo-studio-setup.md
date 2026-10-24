# PRESS'D SEO Studio — setup

SEO Studio (`/admin/seo`) edits what Google and social apps read from the website. Section wording stays in the code.

| Screen | What it edits |
| --- | --- |
| **Overview** | Read-only: pages, SEO issues on the live site, images missing good alt text, saved-but-unpublished changes |
| **Home → Google & sharing** | Title, meta description, optional meta keywords, canonical URL, robots (index/follow), Open Graph / X card tags, validated custom `<meta name>` tags |
| **Home → section tabs** (Top section, About, Visit…) | Alt text of that section's photos, beside a live phone/desktop preview of the section |
| **Images & alt text** | All site photos in one list, filterable to "Missing or too short" |
| **Business info** | The café's structured data (JSON-LD): name, website, phone, email, cuisine, price range, address, map coordinates, opening hours |

Every screen saves a **draft** (Save). Nothing changes on the website until a publisher clicks **Confirm & Publish** in the top bar, which lists every saved change (live value → new value) and publishes them together. Each publish is recorded per screen and can be **restored**.

Keyword research, Search Console, rankings and content strategy are handled separately by the SEO specialist — the studio does not include them and needs no Google accounts or API keys.

> **Before deploying:** www.pressdcafe.ae is currently served by a different repository — the static site `pressd-newwww` — not by this Next.js app. Changes published here appear on whichever domain serves **this** app (e.g. pressd-nextjs.vercel.app or a preview). Replacing the static site is a separate decision.

## How it works

- **Defaults** live in code: tags in `lib/siteMetadata.ts`, alt text in `lib/siteImages.ts`, business details in `lib/seo/core/business.ts` (`BUSINESS_DEFAULTS`). With nothing published, the site renders exactly these.
- **Storage:** each screen is one document in the existing tables, keyed by `path`: `/` (tags), `@images` (alt text), `@business` (business info). Drafts are in `seo_metadata_drafts`, published values in `seo_metadata_overrides`, history in `seo_metadata_changes`. Only values that differ from the defaults are stored.
- **The public page** reads published values only: tags via `generateMetadata` in `app/(site)/layout.tsx`, business info as the JSON-LD script in the same layout, and alt text through `AltTextProvider` in `app/(site)/page.tsx` (components call `useAlt(key)` / `<SiteImg k=…>`). Drafts are never read by the public site.
- **Confirm & Publish** re-validates every draft first — one invalid draft blocks the whole publish and nothing changes — then publishes each document atomically, records history, refreshes `/` and `/sitemap.xml`, and fetches the rendered page to check the tags, alt text and JSON-LD ("live check passed/failed").
- **If the database fails** while the page regenerates, the error stops the regeneration and Next.js keeps serving the last generated page — published values are never silently replaced by defaults. Only when the database is not configured at all (or unreadable during `next build`) are the code defaults used.
- **Sitemap / robots.txt:** `app/sitemap.ts` lists `/` unless it is published as `noindex`; `app/robots.ts` is fixed in code.
- **Pages:** the site has one public URL, `/`. About, Menu, Visit, etc. are views of it (switched by `#hash`) and share its tags, so they appear as tabs of Home. Menu item photos use the product name as alt text and are edited in the menu data.
- **Adding an editable photo:** add an entry to `SITE_IMAGES` in `lib/siteImages.ts` (its `alt` is the default) and render it with `useAlt()("<key>")` or `<SiteImg k="<key>">`.

## 1. Database

1. Create a Neon Postgres database (Vercel → Storage → Neon). **Use a separate database (or Neon branch) for Preview deployments** — never point Preview at the production database.
2. Apply the migrations (creates only `seo_*` tables; additive, no DROP/TRUNCATE/DELETE):
   ```bash
   DATABASE_URL="postgres://…" npm run db:migrate
   ```
   The script prints the target host, runs pending migrations in one transaction and skips ones already applied (safe to re-run).

Local development needs no database: without `DATABASE_URL` an embedded Postgres is created in `.data/` (git-ignored). Production refuses to run without `DATABASE_URL`.

## 2. Users and passwords

Create a password hash for each person (the password is not echoed or stored):

```bash
npm run seo:hash-password
```

Then set `SEO_ADMIN_USERS` to `email:role:hash` entries, comma-separated:

| Role | Can |
| --- | --- |
| `viewer` | View tags, drafts and history |
| `editor` | + save drafts (cannot publish) |
| `publisher` | + publish and restore |
| `admin` | + settings (length guidance) and the activity log |

- Passwords: at least 12 characters, stored only as scrypt hashes.
- 5 failed sign-ins for an email (or 20 from one IP) within 15 minutes lock sign-in for 15 minutes.
- Access is re-checked on every request: removing someone from `SEO_ADMIN_USERS` and redeploying ends their access immediately.

## 3. Session secret

```bash
openssl rand -base64 48   # → SEO_SESSION_SECRET (use a different value per environment)
```

## 4. Deploy (Preview first)

Set `DATABASE_URL`, `SEO_ADMIN_USERS` and `SEO_SESSION_SECRET` for the **Preview** environment in Vercel, deploy a preview, open `/admin/seo`, and check Settings → Configuration. Then save a test change, use Confirm & Publish, confirm "live check passed", and restore it from that screen's publish history.

## Previous dashboard modules

Earlier versions included a crawler, Search Console, PageSpeed and task modules. They have been removed from the dashboard and its API. Their library code and tests remain in `lib/seo/` and `tests/seo/`, and their database tables (`seo_audit_*`, `seo_issues*`, `seo_google_connections`, `seo_gsc_cache`, `seo_performance_runs`, `seo_tasks*`) are left in place unused. They can be deleted in a later, reviewed change.
