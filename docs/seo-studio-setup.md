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

## 1. Database (MongoDB Atlas)

SEO Studio stores its data in MongoDB; the public site only reads published values.

| Collection | Holds |
| --- | --- |
| `seo_metadata_drafts` | Saved, unpublished changes — one document per screen (`_id`: `/`, `@images`, `@business`). Never read by the public site. |
| `seo_metadata_overrides` | What is live — same keys, with `version`, `publishedBy`, `publishedAt`. Only values that differ from the code defaults are stored. |
| `seo_metadata_changes` | Publish history: full before/after snapshot per publish or restore. Unique index on (`key`, `version`). |
| `seo_admin_log` | Sign-ins, failed sign-ins, lockouts and admin actions (used for the lockout; never contains passwords). |
| `seo_settings` | One document (`_id: "default"`): the title/description length guidance. |

Indexes are created automatically on first connection.

**Publishing safety.** Confirm & Publish validates every draft first, then publishes all of them in one multi-document transaction (every Atlas cluster, including the free M0 tier, supports transactions) — either everything goes live or nothing does. Two people publishing the same screen at the same moment cannot both win: the unique (`key`, `version`) history index rejects the second ("someone else published… try again"). Restore publishes the chosen snapshot as a new version; history is never rewritten. On a MongoDB without transactions (a single local server), each screen is published atomically in turn and an interrupted publish is hidden from history and skipped.

**Setting up Atlas**

1. In Atlas, use the existing cluster (`cluster0.y8avod9.mongodb.net`) or create one.
2. *Database Access* → add a database user with **readWrite on `pressd_seo`** only (and a separate user with readWrite on `pressd_seo_preview` for Preview). Use generated passwords.
3. *Network Access* → Vercel functions do not have fixed IP addresses, so allow `0.0.0.0/0` (access still requires the username and password), or use Vercel's Secure Compute / Atlas private networking if your plan has it.
4. Build the connection string from the template in `.env.example`: replace `<db_username>` and `<db_password>` (URL-encode special characters), keep `/pressd_seo` (Production) or use `/pressd_seo_preview` (Preview).
5. Check it from your machine without printing it:
   ```bash
   MONGODB_URI="mongodb+srv://…" npm run seo:db-check
   ```
   It prints the host, database, server version, whether transactions are available and document counts, and creates missing indexes. It changes no data.

**Local development needs no Atlas:** without `MONGODB_URI`, `next dev` starts a local MongoDB whose data lives in `.data/seo-mongo` (git-ignored; the MongoDB binary is downloaded once on first use). Production refuses to run without `MONGODB_URI` — there is no in-memory fallback.

**Earlier Postgres data:** no Postgres database was ever configured for this app (no `DATABASE_URL` locally; the deployed app showed "Setup required"), and the local development database held no drafts, published values, history or settings. There is nothing to migrate.

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

In Vercel → Project → Settings → Environment Variables, set per environment:

| Variable | Preview | Production |
| --- | --- | --- |
| `MONGODB_URI` | Preview user, database `pressd_seo_preview` | Production user, database `pressd_seo` |
| `SEO_ADMIN_USERS` | test accounts (own hashes) | real accounts |
| `SEO_SESSION_SECRET` | its own random value | a different random value |
| `SEO_SITE_URL` | `https://www.pressdcafe.ae` (canonical and share URLs always point at the real domain; leave unset for the same result) | `https://www.pressdcafe.ae` or unset |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | optional | optional — live Google rating on the About section; without them a fixed 4.9 / 100 is shown |

Never reuse Production credentials in Preview. Deploy a preview, open `/admin/seo` and check Settings → Configuration. Then save a test change, use Confirm & Publish, confirm "live check passed", and restore it from that screen's publish history.

## Previous dashboard modules

Earlier versions included a crawler, Search Console, PageSpeed and task modules. They have been removed from the dashboard and its API. Their library code and tests remain in `lib/seo/` and `tests/seo/` on their original Postgres (Drizzle) schema — `lib/seo/db/client.ts`, `lib/seo/db/schema.ts`, `drizzle/`, `lib/seo/page-data.ts` and `lib/seo/services/{audits,gsc,gsc-report,performance,tasks}.ts` — which is why `drizzle-orm` and `@electric-sql/pglite` remain as **dev** dependencies (used only by those modules' tests). Nothing at runtime imports them. They can be deleted, with those two packages, in a later reviewed change.
