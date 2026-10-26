# PRESS'D Wellness Café — Full Project Audit

**Date:** 24 Oct 2026 · **Code audited:** branch `main` at `8598a9f` (1 commit ahead of GitHub) plus one uncommitted fix (see P1-06) · **Next.js** 16.4.2 · **React** 19.2.8 · **MongoDB driver** 7.7

**Environments used**

| Environment | Used for | Notes |
|---|---|---|
| Local production build (`next build` + `next start`, port 3100, no database) | Public site: functional, responsive, accessibility, performance | Identical code to what Vercel builds |
| Local dev server (port 3000) with a **local** MongoDB (`.data/seo-mongo`) | SEO dashboard tests | Never connected to Atlas during the audit |
| Production deployment `https://pressdcafe-nine.vercel.app` | Read-only checks: headers, metadata, Lighthouse | No writes during this audit |
| Live site `https://www.pressdcafe.ae` | Comparison only | Still the separate legacy static site (`pressd-newwww`) |

Nothing was committed, pushed or deployed, and no production data, environment variable, DNS record or Vercel setting was changed.

---

## 1. Executive summary

**What works well**
- The public site renders correctly in **Chromium, Firefox and WebKit**: every view, image, menu category, product dialog, customisation, cart and WhatsApp order flow works. 46 functional checks pass identically in all three engines.
- **No horizontal overflow at any of 18 viewports** (320 px phone to 2560 px ultrawide, plus phone landscape and short laptop screens); every dialog, drawer and menu fits or scrolls (314 automated checks).
- **SEO dashboard: 79/79 end-to-end checks pass** (sign-in, roles, draft → Confirm & Publish → live check → restore, validation, security). Earlier today the same flow was verified on production.
- Technical SEO is clean: one title, description and canonical; complete Open Graph/X tags; valid JSON-LD; correct `robots.txt` and sitemap; admin is `noindex`.
- No secrets in the repository or its history; production dependencies have **0 known vulnerabilities**; admin sessions, CSRF/origin checks, lockout and input validation behave correctly.
- 123/123 unit tests, TypeScript and the production build pass.

**What must be fixed first (P1)**
1. **The "Book a table" form throws bookings away** while telling the customer *"we'll call shortly to confirm"*. (Also true on the live legacy site today.)
2. **The published contact details don't work:** `hello@pressd.cafe` cannot receive email (the domain has no mail or address records) and `+971 50 123 4567` is a placeholder number.
3. **Mobile performance:** browsing the full menu downloads **47 MB** (23 PNG photos of 1.5–2.1 MB); the home page's Largest Contentful Paint is **9.8 s** in a mobile lab test of production.
4. **Google sees different opening hours and address** than the page shows (structured data says open until 23:00/midnight in Jumeirah Village Triangle; the page says 10 PM, Meydan Polo Residence).
5. **Credentials shared in chat are not yet rotated** (Atlas admin user, dashboard admin password).
6. The last (unpushed) favicon commit **breaks the production build**; it is fixed in the working tree but not committed.

**Overall:** the code and the SEO dashboard are production-capable; the public site is functional and responsive but **should not replace www.pressdcafe.ae until P1-01 to P1-04 are fixed**, because those directly lose customers or mislead them.

---

## 2. Architecture overview

- **Next.js App Router**, two root layouts: `app/(site)` (public, one URL `/` with section "views" switched by `#hash`) and `app/admin` (SEO Studio). Unmatched URLs → `app/global-not-found.tsx`.
- **Public page** `app/(site)/page.tsx`: ISR, `revalidate = 21600` (6 h), pre-rendered at build. Reads published SEO values (tags, alt text, business info) from MongoDB; drafts never.
- **State on the client:** cart, customisations, instructions and language in `localStorage`; contexts for section navigation, cart, booking, menu dialogs, locale (10 locales incl. Arabic RTL).
- **Ordering:** cart → WhatsApp deep link (`wa.me/971556838426`) with an itemised message. No payment, no server order storage.
- **Booking:** client-only dialog (see P1-01).
- **SEO Studio:** email + scrypt-hash sign-in (`SEO_ADMIN_USERS`), encrypted 8-hour session cookie, roles viewer/editor/publisher/admin, lockout via `seo_admin_log`; MongoDB collections `seo_metadata_drafts / _overrides / _changes / seo_admin_log / seo_settings`; transactions on Atlas.
- **Edge:** `proxy.ts` gates `/admin` and `/api/admin` (no-store, noindex, X-Frame-Options DENY).
- **Deployment:** Vercel, `vercel.json` pins the Next.js preset; production alias `pressdcafe-nine.vercel.app`.
- **Assets:** 155 files, 82 MB in `public/` (4 videos ≈ 20 MB; 35 PNG; 112 WebP).

## 3. Route and feature inventory

| Route / endpoint | Type | Auth |
|---|---|---|
| `/` (+ views `#home #about #menu #visit #wellness #work`) | Public page (ISR) | — |
| `/robots.txt`, `/sitemap.xml` | Metadata routes | — |
| `/favicon.ico`, `/icon.png`, `/apple-icon.png` | Icons | — |
| any other path | 404 (global-not-found) | — |
| `/admin` → `/admin/seo` | Redirect | session |
| `/admin/login` | Sign-in page | public |
| `/admin/seo` Overview · `/admin/seo/pages?tab=seo|hero|about|…` · `/admin/seo/images` · `/admin/seo/business` · `/admin/seo/settings` | Dashboard pages | viewer+ |
| `POST /api/admin/auth/login`, `POST /api/admin/auth/logout` | Auth | origin-checked |
| `POST/DELETE /api/admin/seo/drafts` | Save/discard draft | editor+ |
| `GET/POST /api/admin/seo/publish` | Pending list / Confirm & Publish | viewer+ / publisher+ |
| `POST /api/admin/seo/restore` | Restore a version | publisher+ |
| `POST /api/admin/seo/verification` | Record live-check result | publisher+ |
| `POST /api/admin/seo/settings` | Length guidance | admin |

Public interactive controls: navbar (logo, Menu/Visit/About, cart, Book a table, hamburger), hero Explore rail (Menu link, Reservation button, Our café link, dots), Instagram button, About review carousel (arrows, 6 dots, Read all reviews), menu (9 category tabs, sub-section buttons, 97 product cards with View details / Customize / Comment / Add), product, customise and instructions dialogs, language selector (10 locales), cart drawer (± quantity, WhatsApp order), booking dialog, Visit (Book, Get directions, Show route, Open in Maps, phone, email, Instagram), mobile menu, mobile dock (Home, Menu, Cart, WhatsApp), back-to-top, section home button, footer links.

## 4. Functional test matrix — public site

Automated in Chromium, Firefox and WebKit (desktop 1440×900 and phone 390×844). Results were identical in all three engines.

| Area | Check | Result |
|---|---|---|
| Load | Home 200; loader dismisses; no uncaught errors; no failed requests | PASS |
| Assets | All images load; every `<img>` has `alt`; videos load | PASS |
| Navigation | Desktop Menu/Visit/About open their views; logo returns home; refresh keeps the view | PASS |
| Navigation | Browser **Back** returns to the previous view | **FAIL** (P2-01) |
| Navigation | Direct link `/#visit` etc. opens that view and keeps the URL | **FAIL** (P2-02) |
| Booking | Opens from navbar, hero rail, Visit; empty submit blocked; Escape/backdrop close; focus returns | PASS |
| Booking | Valid submission is delivered anywhere | **FAIL** (P1-01) |
| Booking | Inputs have `name`/`autocomplete`; past dates rejected | **FAIL** (P2-14) |
| Menu | Each of 9 categories shows its items; cards show name/price/image; details open by click, keyboard and button; Escape closes | PASS |
| Menu | Customise → add to cart carries options and price; comment saved | PASS |
| Menu | Category tabs announce selected state to assistive tech | **FAIL** (P2-07) |
| Cart | Add, rapid repeated add (no duplicate lines), ± quantity, total = sum of lines, empty state, persists after reload | PASS |
| Cart | WhatsApp link goes to +971 55 683 8426 with every item and the total | PASS |
| Cart | Desktop navbar shows item count | **FAIL** (P2-10) |
| Cart | Escape closes the drawer; drawer is exposed as a dialog | **FAIL** (P2-06) |
| Language | 10 locales; Arabic switches text and sets RTL; choice persists | PASS |
| Mobile | Hamburger opens; each link opens its view and closes the menu; dock cart; hero Reservation tap; dialogs fit and scroll | PASS |
| Mobile | Escape closes the mobile menu | **FAIL** (P2-06) |
| Mobile | Hero carousel autoplays | **FAIL** (P2-09) |
| Links | External links open in a new tab with `noopener`; WhatsApp, Google Maps, both Instagram handles respond 200 | PASS |
| Links | Contact email and phone reach the café | **FAIL** (P1-02) |
| Routing | Unknown URL → 404 | PASS (unbranded page, P3-08) |
| Console | No errors; preload warnings only | Warnings (P3-03) |

## 5. Functional test matrix — SEO dashboard

79 automated end-to-end checks (`dash-check.js`) plus 20 edge-case checks, all on the local dev server and local database.

| Area | Result |
|---|---|
| Sign-in for all four roles; wrong password generic; lockout; empty form blocked; autocomplete attributes | PASS |
| Password show/hide control | NOT IMPLEMENTED (optional) |
| Anonymous / forged cookie → 401 / redirect; viewer cannot save; editor cannot publish/restore; cross-site requests 403 | PASS |
| Sign-out clears the cookie; cross-site sign-out refused | PASS |
| A copied session cookie is rejected after sign-out | **FAIL** (P3-01, stateless sessions) |
| Draft save; persists after refresh (incl. Arabic, emoji, curly quotes); not visible publicly | PASS |
| Validation: >120-char title, angle brackets, unknown image key, bad hours, managed meta names, script-like names | PASS (rejected with clear messages) |
| Confirm & Publish of tags + alt text + business together; live check confirms; restore; history | PASS |
| Two people editing the same draft | Last save wins without warning (P3-02) |
| Unsaved-change warning on reload/close | PASS |
| Unsaved-change warning when clicking a sidebar link | **FAIL** (P2-12) |
| Database down: save fails with an error (no false success) | PASS (generic message, 5 s) |
| Database down: dashboard pages | **FAIL** — raw 500 page (P2-13) |
| Section tab opens at the top of the page | **FAIL** (P2-11) |

Production (earlier today, with authorisation): sign-in, Configuration all OK, draft private, publish live in ~8 s, restore, 401/403 checks — all PASS.

## 6. Responsive viewport matrix

18 viewports × 11 public states + 7 dashboard pages = **314 automated layout checks** (horizontal overflow with offending element, dialog fit/scroll, tap-target size, tiny text) and screenshots at 7 sizes.

| Viewport | Public views & dialogs | Dashboard |
|---|---|---|
| 320×640, 360×800, 375×812, 390×844, 414×896, 430×932 | No overflow; dialogs fit/scroll | No overflow; tab bar scrolls sideways (P3-11) |
| 600×960, 768×1024 | No overflow | No overflow |
| 1024×768 | No overflow; **Visit text spills out of the "Get in touch" card** (P2-03) | No overflow |
| 1280×720, 1366×768, 1440×900, 1600×900, 1920×1080 | No overflow | No overflow |
| 2560×1080 | No overflow; centred layout with wide side margins (design) | No overflow |
| 844×390, 932×430 (phone landscape) | **Visit panels overlap; navbar Instagram button covers "Book a table"** (P2-03, P2-04) | Sticky bar takes ~⅓ of the height (P3-11) |
| 1280×600 (short laptop) | No overflow | No overflow |

Small touch targets on phones (WCAG 2.5.8): hero dots 6×6 px, review dots 14 px tall, Visit phone/email/Instagram links 12–15 px tall (P2-08).

Screenshots: `docs/audit/viewport-pub-*.jpg`, `docs/audit/viewport-adm-*.jpg`, defects `docs/audit/defect-*.jpg`.

## 7. Accessibility results

axe-core (WCAG 2.0/2.1/2.2 A+AA and best practice) on 12 public states × 2 sizes and 7 dashboard pages, plus manual keyboard checks.

| Rule / issue | Impact | Where | ID |
|---|---|---|---|
| Closed cart drawer is `aria-hidden` but its buttons stay focusable — Tab moves into an invisible drawer (3 stops) | serious | every public view | P2-05 |
| `role="tablist"` with plain buttons (no `role="tab"`, no `aria-selected`) | critical | menu | P2-07 |
| Interactive menu cards contain buttons (`nested-interactive`, 97 cards) | serious | menu | P2-07 |
| Hero rail cards have **no visible focus indicator** (`outline-color: transparent` overrides `:focus-visible`) | serious (2.4.7) | home | P2-05 |
| Cart drawer not a dialog (no role, focus not moved in, Escape ignored); mobile menu ignores Escape | serious | cart, mobile | P2-06 |
| Colour contrast: grey on cream 3.48:1 in cart/product dialogs; dashboard `.faint` text 4.05:1 | serious (1.4.3) | cart, dialogs, dashboard | P2-08 |
| Tap targets below 24 px | serious (2.5.8) | hero dots, reviews, Visit links | P2-08 |
| 77% of text below Lighthouse's legible size on mobile | moderate | mobile | P2-08 |
| No `<h1>` in some views on mobile (hero hidden) | moderate | detail views | P3-12 |
| Hero video keeps playing with "reduce motion"; no pause control | moderate (2.2.2) | home | P3-09 |
| `figure` with `role=group`; scrollable `#wellness` not keyboard-focusable; dashboard heading order | minor | about, wellness, business | P3-12 |
| Booking dialog, admin login | — | 0 violations | — |

Good: dialogs use native `<dialog>` with focus return; images all have alt text; Arabic sets `dir="rtl"`; CSS animations stop under reduced motion; dashboard forms have labels and error associations.

Not performed: manual screen-reader testing (VoiceOver/NVDA) and 200% browser zoom (narrow viewports approximate it).

## 8. Performance (lab measurements only — no real-user data exists)

| Measurement | Result |
|---|---|
| Lighthouse mobile, **production** (simulated slow 4G, mid-tier CPU) | Performance **54**, FCP 5.4 s, **LCP 9.8 s**, Speed Index 9.4 s, TBT 210 ms, CLS ≈ 0, **5.96 MB** |
| Lighthouse mobile, local production build | FCP 4.7 s, Speed Index 14.8 s, LCP not measurable (full-screen loader), 6.1 MB |
| Lighthouse desktop, local production build | Performance 85, LCP 1.9 s, TBT 0 ms, CLS 0.001, 12.4 MB |
| Lighthouse SEO / Best practices / Accessibility (mobile, local) | 100 / 96 / 91 |
| Menu view, phone, scrolled to the end | **47.1 MB**, 96 images, of which 23 PNG = **38.7 MB** (largest 2.1 MB each); images are lazy but have no `srcset`/`sizes` |
| JavaScript for `/` | 9 files, 658 KB raw / 199 KB gzip |
| CSS | one 266 KB render-blocking file (17,210 lines; ~204 KB unused on first view) |
| HTML | 139 KB raw / 20 KB gzip |
| Hero video | 3.8 MB, `preload="auto"` plus a `<link rel=preload as=video>` (unsupported, emitted twice) — 64% of mobile page weight |
| Fonts | Google Fonts CSS incl. Noto Sans JP/KR (167 KB) render-blocking on every page, even in English |
| Unused files in `public/` | ≈ 25 MB (e.g. `visit-location-cover.mp4` 6.4 MB, `petEye.mp4` 4 MB, superseded PNG/WebP) — deployment size only |

No hydration errors or uncaught exceptions were observed. One leaked `visibilitychange` listener in `Hero.tsx` (P3-10).

## 9. Security findings

| Finding | Severity |
|---|---|
| No secrets tracked in git or present in history; `.env*`, `.data/`, `.vercel` ignored | ✓ |
| Production dependencies: 0 vulnerabilities. One high advisory (`zod` < 4.6.6) only in the ESLint toolchain | ✓ / P3 |
| Admin: session cookie `HttpOnly`, `Secure` (production), `SameSite=Lax`, 8 h absolute; origin check on every state-changing request; role checks server-side on every request; lockout 5/email, 20/IP per 15 min; generic error messages | ✓ |
| Admin headers: HSTS, `X-Frame-Options: DENY`, `noindex`, `no-store`, same-origin referrer | ✓ |
| Injection: JSON-LD escapes `<`; custom meta names/values validated; alt text rejects markup; no `dangerouslySetInnerHTML` with user data | ✓ |
| **Public pages send no CSP, `X-Content-Type-Options`, frame protection, `Referrer-Policy` or `Permissions-Policy`; `X-Powered-By: Next.js` exposed** | P2-15 |
| Sessions are stateless: sign-out deletes the cookie, but a copied cookie remains valid for up to 8 h; removing a user from `SEO_ADMIN_USERS` does revoke immediately | P3-01 |
| No rate limit on authenticated APIs (acceptable: few trusted users) | info |
| **Credentials disclosed in chat (Atlas `atlasAdmin` user + password, dashboard admin password) — the Atlas password was confirmed unchanged earlier today** | P1-05 |

## 10. Database and API findings

- Every endpoint: auth + role + origin check → bounded JSON body → server validation → MongoDB; errors map to 400/401/403/409/503/500 without internals.
- Publishing is a transaction on Atlas; a unique `(key, version)` index stops two simultaneous publishes; history is append-only; drafts re-saved during publishing are kept (unit-tested against a real local replica set).
- Database unreachable: save returns 500 after ~5 s ("Something went wrong"); dashboard pages show a raw 500 (P2-13). Public page in production keeps serving its last cached version (ISR; unit-tested policy, not reproduced end-to-end in production mode).
- Missing `MONGODB_URI` in production → dashboard shows "Database not configured", sign-in refuses, public site uses code defaults (verified earlier).
- **Production uses database `pressd_seo_dev`** (verified earlier today) — rename to `pressd_seo` in Vercel to avoid confusion with local development (P2-16).
- Drafts are last-write-wins between editors (P3-02).

## 11. SEO findings

| Check | Result |
|---|---|
| One `<title>`, one description, one canonical `https://www.pressdcafe.ae`, `lang="en"` | PASS |
| Open Graph + X card complete; share image 200 on both www and Vercel | PASS |
| JSON-LD: one valid `CafeOrCoffeeShop` block | PASS (content wrong — P1-04) |
| `robots.txt` (allow `/`, disallow `/api/`, sitemap link); sitemap lists `/` | PASS |
| Admin `noindex` (header); public pages indexable; Vercel preview URLs behind login | PASS |
| One `<h1>`; 142 headings in a logical h2→h3→h4 outline | PASS |
| Structured-data hours/address differ from the page | **FAIL** (P1-04) |
| Visible spelling errors in menu names: "Avacado" (×3), "Ceasar", "Tabbouloleh" | P3-05 |
| Two Instagram handles used (`@pressd.cafe`, `@pressd_wellness_cafe`) | P3-06 |
| Mobile LCP 9.8 s, small text | affects Core Web Vitals (P1-03) |

Legacy static site (www.pressdcafe.ae) shares the booking, phone and email defects; it was otherwise not audited.

## 12. Cross-browser findings

Chromium (Playwright 1243), Firefox (Playwright 1555) and WebKit 27.2 (Safari engine): identical functional results (46 PASS / 16 FAIL, same items). Differences only in console wording (Firefox reports the ignored video preload explicitly). **Not tested:** real iOS Safari or Android Chrome on physical devices, Edge, Samsung Internet.

## 13. Console and network

- Errors: none. Uncaught exceptions: none. Failed requests (≥400 or network): none.
- Warnings in every engine: `<link rel=preload as=video>` unsupported (emitted twice), image/font preloads unused within a few seconds (10 image preloads, Playfair italic font).

## 14. Issue register

### P0 — Critical
None found.

### P1 — High

| ID | Area | Issue | Evidence | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|
| P1-01 | Booking | Valid booking shows *"Thanks — we'll call shortly"* but is sent nowhere | All 3 engines: no request, popup, mailto or WhatsApp on submit | `BookingDialog.tsx` only sets a note; ported 1:1 from legacy `script.js` | Send it somewhere real — e.g. compose a WhatsApp message (like orders) or post to an API that emails/stores it — and say honestly what happens next | Submit triggers the chosen channel with name/phone/date/guests |
| P1-02 | Contact | `hello@pressd.cafe` has no MX/A records (undeliverable); `tel:+971501234567` is a placeholder | `dig`; `VisitSection.tsx:242,249`, `Footer.tsx:27` | Placeholder content from the legacy site | Replace with the café's real phone/email (owner to confirm) | Link values match confirmed details |
| P1-03 | Performance | Full menu = 47 MB on a phone; LCP 9.8 s (production mobile lab); 6 MB home | Lighthouse + CDP byte counts | 1.5–2.1 MB PNGs without responsive sizes; 3.8 MB hero video preloaded; render-blocking CJK font CSS | Convert menu PNGs to WebP/AVIF at display sizes (or `next/image`); `preload="metadata"` + poster for the hero; load JP/KR fonts only for those locales; remove the invalid video preload | Byte budget test per view; Lighthouse CI |
| P1-04 | SEO data | JSON-LD says Mo–Th 07–23, Fr–Su 07–00, Jumeirah Village Triangle; page says 7 AM–10 PM daily, Meydan Polo Residence | Rendered HTML vs `VisitSection.tsx` | Defaults in `lib/seo/core/business.ts` differ from page content | Owner confirms true hours/address; set them in Business info (no code change needed) or align defaults | Overview "SEO issues" warns on mismatch |
| P1-05 | Operations | Atlas password (atlasAdmin user) and dashboard admin password shared in chat; Atlas password still unchanged at last check | Earlier verification | — | Rotate both; use a readWrite-only Atlas user for the app; update Vercel | `npm run seo:db-check` after rotation |
| P1-06 | Build | Local commit `8598a9f` (new favicon) **fails `next build`**: *"The PNG is not in RGBA format"* | Build log | `favicon.ico` saved as RGB | **Fixed in the working tree (uncommitted)** — commit it before pushing | `npm run build` in CI |

### P2 — Medium

| ID | Area | Issue | Fix |
|---|---|---|---|
| P2-01 | Navigation | Back button leaves the site instead of returning to the previous view (`history.replaceState`) | Use `pushState` for view changes and handle `popstate` |
| P2-02 | Navigation | Shared links like `/#visit` open the view only sometimes (race between `ScrollInit` and section navigation) and the URL is rewritten to `#home` | Let `ScrollInit` keep a valid section hash; read the hash once before normalising |
| P2-03 | Responsive | Visit view: text overlaps at 844×390/932×430 and the inquiries paragraph spills out of its card at 1024×768 | Let the Get-in-touch card grow/scroll at those heights; adjust the short-height breakpoint (no redesign) |
| P2-04 | Responsive | Navbar Instagram round button overlaps "Book a table" at phone landscape (and partly at 1440 in detail views) | Reserve space for the button or hide it at those widths |
| P2-05 | Accessibility | Tab reaches 3 invisible controls in the closed cart; hero rail cards show no focus ring | `inert` (or `hidden`) on the closed drawer; remove `outline-color: transparent` for `:focus-visible` |
| P2-06 | Accessibility | Cart drawer not a dialog (no role, no focus move, Escape ignored); mobile menu ignores Escape | `role="dialog" aria-modal`, move/trap focus, Escape handlers |
| P2-07 | Accessibility | Category bar `role="tablist"` without tabs; menu cards are buttons containing buttons | Add `role="tab"`/`aria-selected` (or drop the tablist role); make the image/title the details trigger instead of the whole card |
| P2-08 | Accessibility | Contrast 3.48:1 (cart/dialog captions), 4.05:1 (dashboard faint text); 6 px/14 px tap targets; 77% small text on mobile | Darken the two greys; enlarge hit areas (padding) without changing visuals; review 9–11 px captions |
| P2-09 | Function | Mobile hero carousel never auto-advances (stays on "Reservation") | `advance()` reads `carouselIndex` from a stale closure (effect with `[]`) — use a ref or functional update |
| P2-10 | Function | Desktop navbar cart shows no item count (legacy showed "Cart N"; mobile dock does show it) | Render the count in the navbar button (CSS for it already exists: `.cart-toggle span.count-roll`) |
| P2-11 | Dashboard | Opening a section tab lands scrolled down (1261 px on phones) | The preview's hero calls `scrollIntoView` before the preview patches it — fix with P2-09 (use `rail.scrollTo` instead of `scrollIntoView`) |
| P2-12 | Dashboard | Clicking a sidebar link discards unsaved edits without warning | Intercept in-app navigation when the form is dirty |
| P2-13 | Dashboard | Database unreachable → raw 500 page; saves take 5 s then say "Something went wrong" | Treat connection errors like "database unavailable": friendly notice and 503 |
| P2-14 | Booking | Inputs lack `name`/`autocomplete`; past dates accepted | Add attributes and `min=today` (part of P1-01 rework) |
| P2-15 | Security | No security headers on public pages; `X-Powered-By` | Add CSP (report-only first), `nosniff`, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`; `poweredByHeader: false` |
| P2-16 | Config | Production database is named `pressd_seo_dev` | Change the Vercel Production `MONGODB_URI` to `/pressd_seo` |

### P3 — Low

| ID | Issue |
|---|---|
| P3-01 | Sessions can't be revoked individually at sign-out (stateless, 8 h) |
| P3-02 | Concurrent draft edits: last save wins, no warning |
| P3-03 | Preload warnings: invalid/duplicated video preload, unused image and font preloads |
| P3-04 | 266 KB single CSS file (~204 KB unused at first view); 25 MB of unused files in `public/` |
| P3-05 | Menu typos: Avacado, Ceasar, Tabbouloleh (and "Colon Cleaning" — confirm intended name) |
| P3-06 | Two different Instagram handles across the site |
| P3-07 | 17 lint warnings (`<img>` instead of `next/image`) |
| P3-08 | 404 page is the plain Next.js default, not branded |
| P3-09 | Hero video ignores "reduce motion" and has no pause control |
| P3-10 | `Hero.tsx` never removes its `visibilitychange` listener |
| P3-11 | Dashboard on phones: tab bar scrolls sideways with Settings/View website off-screen; sticky bars take much height in landscape |
| P3-12 | Minor a11y: missing `<h1>` in mobile detail views, `figure role=group`, unfocusable scroll region, dashboard heading order |
| P3-13 | No show/hide password control on the login form (optional) |
| P3-14 | `zod` advisory in the lint toolchain only |

## 15. Coverage gaps (not tested or blocked)

| Item | Status | Reason |
|---|---|---|
| Physical iPhone/Android devices, iOS Safari, Edge, Samsung Internet | NOT TESTED | Emulation only (Chromium/Firefox/WebKit engines) |
| Real-user Core Web Vitals | NOT AVAILABLE | No field data collected |
| Vercel dashboard (project settings, env vars per environment, build logs, domains) | BLOCKED | No Vercel access from this machine |
| Google Maps embed rendering | NOT VERIFIED | Third-party iframe blank in headless browser |
| Live Google reviews (Places API) | NOT VERIFIED | Unknown whether keys are set in Vercel; fallback 4.9 / 75 renders |
| WhatsApp message delivery | NOT TESTED | Link and message content verified only |
| Screen readers (VoiceOver/NVDA), 200% zoom | NOT TESTED | Manual assistive-technology session needed |
| Production behaviour with the database down | NOT TESTED end-to-end | Covered by unit tests of the ISR failure policy |
| Production dashboard during this audit | NOT TESTED (by rule) | Verified earlier today with authorisation |
| Legacy static site | Spot-checked only | Separate repository, out of scope |

## 16. Production readiness

| Part | Ready? |
|---|---|
| Build, deploy pipeline, SEO metadata, robots/sitemap | Yes (commit the favicon fix first) |
| SEO dashboard | Yes, after credential rotation (P1-05) and the database rename (P2-16) |
| Public site — functionality | Mostly; **booking and contact details are not** (P1-01, P1-02) |
| Public site — mobile performance | No; P1-03 should be addressed before the domain switch |
| Public site — accessibility | Partial; P2-05 to P2-08 recommended |
| Domain switch (www.pressdcafe.ae → this app) | **Not yet** — fix P1-01 to P1-04 first; note the legacy site has the same booking/contact defects today |

## 17. Remediation plan (for approval)

1. **Before anything is pushed:** commit the favicon fix (P1-06).
2. **Business decisions (owner):** real phone/email, true hours and address, how bookings should arrive (WhatsApp, email, or a booking service).
3. **Sprint 1 — customer-facing correctness:** P1-01, P1-02, P1-04 (via Business info), P2-14, P2-09/P2-11 (one fix), P2-10.
4. **Sprint 2 — mobile performance:** P1-03 (image conversion and responsive sizes, hero video loading, font loading, preload clean-up — no visual change), P3-03, P3-04.
5. **Sprint 3 — navigation and accessibility:** P2-01, P2-02, P2-05 to P2-08, P3-09, P3-12.
6. **Sprint 4 — hardening:** P2-15 (headers), P2-13, P2-12, P2-03/P2-04 layout fixes, P3 items.
7. **Operations (any time):** P1-05 credential rotation, P2-16 database name.
8. **Add to the repository:** a Playwright suite based on this audit's scripts (public flows, responsive overflow, axe), run in CI with the unit tests and build.

## 18. Final pass/fail summary

| Suite | Command / tool | Result |
|---|---|---|
| Unit + integration (real local MongoDB) | `npm test` | **123 / 123 pass** |
| TypeScript | `npx tsc --noEmit` | **pass** |
| Lint | `npm run lint` | **0 errors**, 17 warnings |
| Locale files | `npm run validate:locales` | **all valid** |
| Production build | `npm run build` | **fail** at `8598a9f` (P1-06) → **pass** with the working-tree fix |
| Public functional (Chromium / Firefox / WebKit) | Playwright | **46 PASS / 16 FAIL** each (same items) |
| Responsive (18 viewports, 314 checks) | Playwright | **0 overflow, 0 dialog-fit failures**; 3 visual layout defects found by screenshot review |
| Dashboard end-to-end | Playwright `dash-check.js` | **79 / 79 pass** |
| Dashboard edge cases | Playwright + API | 13 pass, 4 fail, 1 not implemented, 2 info |
| Accessibility | axe-core 4.x | 0 violations on booking dialog and login; 9 rule types elsewhere |
| Performance | Lighthouse 12.8.2 (lab) | Mobile production 54; desktop local 85 |
| Production smoke (read-only) | curl | Pages, headers, metadata OK |

Audit scripts and full raw results (JSON, ~130 screenshots) are kept outside the repository in the session scratchpad; the curated evidence is in `docs/audit/`.
