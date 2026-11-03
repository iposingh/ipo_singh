# Website production build and SEO launch

**Prompt:** 74\
**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Next.js public site (`apps/web`) — route audit, metadata, canonicals, sitemap, robots, structured data, HTTP status for missing IPOs, CWV basics, ads/app promo preserved.\
**Does not:** promise rankings, modify DNS, keyword-stuff, invent reviews/ratings, or expose API keys in HTML.

Related: `docs/seo-checklist.md`, `docs/public-website-readiness.md`.

---

## 1. Route inventory (public)

| Path | Purpose | Index |
| --- | --- | --- |
| `/` | Home (Mainboard-first SSR catalogue + ads + app promo) | Yes |
| `/ipos/mainboard`, `/ipos/sme` | Board browse (overview indexable; filters/pages noindex) | Conditional |
| `/ipos/[slug]` | IPO detail SSR | Yes when stored |
| `/ipos/listed` | Listed performance | Landing yes; filtered no |
| `/ipo-calendar` (`/calendar` → 308) | Calendar | Landing yes; query variants no |
| `/compare` | Compare landing | Empty landing yes; selections no |
| `/allotment` | Registrar allotment board | Landing yes; `?board=` noindex, canonical `/allotment` |
| `/blog`, `/blog/[slug]` | Educational “IPO Insights” | Yes |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | Legal/info | Yes |
| `/search`, `/account`, `/login`, `/register`, `/watchlist`, `/notifications` | Tools/auth | **noindex** + robots disallow |
| `/gmp`, `/subscription`, `/ipo-unavailable` | Placeholders / missing rewrite target | **noindex** + robots disallow |
| `/admin/*`, `/design-system`, `/api/*` | Internal | **noindex** / disallow |

App-download banner and promotional carousel on the home page are preserved (`AppDownloadBanner`, `AdCarousel` with eager/`fetchPriority=high` on the first slide).

---

## 2. Metadata, canonicals, Open Graph

- Helper: `lib/seo/metadata.ts` → title, description, `alternates.canonical`, robots, Open Graph, Twitter.
- Root `metadataBase` from `IPO_SINGH_SITE_URL` (`lib/seo/site.ts`). **Required for production** so relative canonicals resolve.
- IPO detail descriptions (`lib/seo/copy.ts`) use stored board, status, status-relevant dates (open / close / listing), and prices only — no GMP, no ratings.
- Filtered browse / calendar / compare / allotment board pages set `index: false` and keep the clean landing canonical.

Verified against a production start with `IPO_SINGH_SITE_URL=https://ipo.example.com`:

- Home `<title>`: `IPO Singh | All IPO Insights. One Place.`
- Home canonical: `https://ipo.example.com`
- Home robots: `index, follow`
- `/allotment?board=mainboard` → `noindex, follow` + canonical `https://ipo.example.com/allotment`

---

## 3. Sitemap and robots

| Artifact | Implementation |
| --- | --- |
| `/sitemap.xml` | `app/sitemap.ts` + `sitemapEntries` — static indexable paths, published blog articles, stored IPO slugs (deduped, schema-validated). Empty if `IPO_SINGH_SITE_URL` unset. |
| `/robots.txt` | Allow `/`; disallow private paths + `/*?`; sitemap/host when origin set |

Verified sample robots (excerpt):

```text
User-Agent: *
Allow: /
Disallow: /search
…
Disallow: /ipo-unavailable
Disallow: /api/
Disallow: /*?
Host: https://ipo.example.com
Sitemap: https://ipo.example.com/sitemap.xml
```

Sample sitemap included `/`, board landings, calendar, listed, compare, allotment, blog, legal pages (15 `<loc>` entries when the catalogue was empty). Query variants are omitted.

Cap: sitemap IPO list follows the catalogue loader page limit (see `docs/seo-checklist.md`).

---

## 4. Structured data (valid, non-misleading)

| Page | Markup |
| --- | --- |
| Home | `WebSite` + optional `CollectionPage` / `ItemList` of visible links |
| Board browse | `CollectionPage` when indexable overview has items |
| IPO detail | `WebPage` + Organization `about` + BreadcrumbList + stored INR `PropertyValue`s |
| Calendar / listed / compare landings | `WebPage` |

**Excluded:** reviews, aggregate ratings, star counts, GMP as listing gain, invented prices.

JSON-LD escapes `<` (`components/seo/json-ld.tsx`). Home HTML check: 2 `application/ld+json` blocks; no IPO Guru keys.

---

## 5. HTTP status and unavailable IPOs

Partial Prerendering + `(site)/loading.tsx` streams a shell first, so `notFound()` alone can leave **HTTP 200** with `noindex` (Next.js streaming behaviour). Prompt 74 requires a real status code for missing IPO URLs.

| Case | Behaviour |
| --- | --- |
| Invalid slug shape | `proxy.ts` returns **HTTP 404** + `x-robots-tag: noindex, nofollow` + missing-IPO HTML |
| Valid slug, API `404` | Same **HTTP 404** response from `proxy.ts` (existence check only) |
| Catalogue unreachable / non-404 failure | Soft page error, **200** + noindex (not treated as permanent removal) |
| Stored IPO | **200** SSR detail + indexable metadata |

Helpers: `lib/seo/ipo-status-proxy.ts`, `lib/seo/missing-ipo-html.ts`. Do not redirect a missing IPO to a different company.

Verified with a local mock API: `/ipos/Bad_Slug!!` → **404**; `/ipos/missing-company` → **404**.

---

## 6. Performance, mobile, accessibility (baseline)

| Area | Evidence |
| --- | --- |
| Fonts | Geist with `display: swap`, preload |
| Images | `next/image` brand logo; AVIF/WebP; ad carousel first slide `loading=eager` + `fetchPriority=high`, later slides lazy |
| Cache / PPR | `cacheComponents`, `partialPrefetching` in `next.config.ts` |
| Security headers | `nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, Permissions-Policy |
| A11y | Skip link, `lang="en"`, focus styles; mobile-first layout |

Field Core Web Vitals still need Search Console after launch — lab builds are not a substitute.

---

## 7. Secrets in public HTML

- Site talks only to `IPO_SINGH_API_ORIGIN` (server / proxy). No IPO Guru keys in client bundles.
- Admin UI is noindex and robots-disallowed; session cookies are HttpOnly via API BFF.
- Production home HTML scan: no `IPOGURU` / `api_key` matches; app-download banner present.

---

## 8. Production env (no DNS changes in this prompt)

```text
IPO_SINGH_SITE_URL=https://www.example.com
IPO_SINGH_API_ORIGIN=https://api.example.com
```

Leave store URLs empty until apps are listed. Do not set vendor hosts as `IPO_SINGH_SITE_URL`.

---

## 9. Verification (Prompt 74)

| Check | Result |
| --- | --- |
| `npm test -w @ipo-singh/web` SEO + status-proxy suite | **91 pass / 0 fail** |
| `IPO_SINGH_SITE_URL=… npm run build -w @ipo-singh/web` | **Pass** (routes include `/robots.txt`, `/sitemap.xml`, Proxy) |
| `npm run typecheck -w @ipo-singh/web` | Pass (prior run this prompt) |
| `npm run lint -w @ipo-singh/web` | Pass (prior run this prompt) |
| Live curl: robots, sitemap, home canonical/JSON-LD, allotment noindex | Pass |
| Live curl: missing/invalid IPO → HTTP **404** | Pass (with mock API for stored-missing) |
| Production DNS / Search Console submit | **Not done** — requires approval |

Post-deploy: follow `docs/seo-checklist.md` (Search Console, sitemap submit, URL Inspection). This document does not claim first-page rankings.

---

## 10. Code touchpoints (Prompt 74)

| Change | Why |
| --- | --- |
| `lib/seo/copy.ts` | Status-specific dates in Open / Upcoming / Listed meta descriptions |
| `lib/seo/indexing.ts` + allotment `generateMetadata` | Board-filtered allotment stays noindex with clean canonical |
| `features/promotions/ad-carousel.tsx` | `fetchPriority=high` on first slide for LCP |
| `proxy.ts` + `lib/seo/ipo-status-proxy.ts` + `missing-ipo-html.ts` | Real **HTTP 404** for missing IPO URLs under PPR |
| `app/(site)/ipo-unavailable/page.tsx` | Direct missing document; robots-disallowed |
| `lib/seo/site.ts` | Disallow `/ipo-unavailable` |
| `docs/website-seo-launch.md` | This launch record |
