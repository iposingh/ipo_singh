# Public website readiness

Audit date: 23 October 2026. Scope is the public site in `apps/web` after Prompts 23–31. Mobile app development has not started.

The site reads IPO Singh's API. It does not call IPO Guru. Calculations stay in `@ipo-singh/core`. Response shapes stay in `@ipo-singh/contracts`.

Related docs: `docs/seo-checklist.md`, `docs/website-integration-audit.md`, `docs/backend-readiness.md`, `docs/ipoguru-request-budget.md`.

## Implemented features

| Area | What the site does |
| --- | --- |
| Homepage | Mainboard-first page: open, upcoming, recently closed, recently listed, and a calendar preview. SME stays on its own route. |
| SME and Mainboard lists | Separate routes. A status, search, or custom sort opens one paginated list. Board comes from the stored `board`, not issue size. |
| IPO detail | Overview, GMP, subscription, financials, allotment, listing, and documents. A missing slug says the page is not available and does not substitute another company. |
| GMP | Current premium in rupees, derived percent, and an indicative price. History is observed points only. Copy says GMP is unofficial and is not a listing gain. A missing premium stays unavailable. |
| Subscription | Category and day-wise history on the IPO page. A published zero stays 0x. A missing multiple stays unavailable. `/subscription` does not show a market total. |
| Financials | Stored statement rows with their metric and unit, or prose when the source has no rows. |
| Allotment | Check Allotment opens only a verified KFin, MUFG Intime, or Bigshare page. PAN and application numbers are not collected. |
| IPO Calendar | Month grid and list in India Standard Time. Empty days stay empty. `/calendar` redirects to `/ipo-calendar`. |
| Listing history | Actual issue price, listing price, and listing gain. GMP is not shown as that gain. |
| Comparison | Two to four stored issues, side by side, with missing values kept distinct. No ranking or recommendation. |
| Search | Name, symbol, and partial name, plus board, status, and date filters. Suggestions call the site's `/api/search` route. |
| Advertisement carousel | Three IPO Singh house slides, desktop and mobile artwork, arrows, pagination, keyboard controls, pause, and reduced motion. Paid slides require an Advertisement or Sponsored label. |
| App download | Homepage banner, desktop strip, and a mobile bar above the bottom navigation. Dismissal lasts for the browser session. Unpublished stores say Coming soon. |
| Theme | Light, dark, and system. The choice is stored in `localStorage`. |
| Attribution and freshness | A source whose name includes IPO Guru gets a "Data by IPO Guru" link. Observation times use Asia/Kolkata. Missing, zero, and stale stay distinct. |

`/gmp` and `/subscription` point back to the IPO lists. They are not in the primary navigation. Account sign-in and the watchlist are available. The watchlist nav item has no Soon badge. The design-system page is a labeled sample gallery and is disallowed in `robots.txt`.

## Test results

Checked on 23 October 2026.

| Check | Result |
| --- | --- |
| TypeScript, all workspaces | Passed |
| ESLint, API and web | Passed |
| Web unit tests | 66 passed |
| API unit and integration tests | 162 passed, 0 failed. The live IPO Guru connectivity test stays skipped without a key and `IPOGURU_CONNECTIVITY_TEST=1`. |
| Contracts | 5 passed |
| Core | 19 passed |
| Design tokens | 2 passed |
| Production build | Passed. `cacheComponents` and `partialPrefetching` stayed on. |

Browser checks used a production server on `http://127.0.0.1:3026` with `IPO_SINGH_SITE_URL` and `IPO_SINGH_API_ORIGIN` set on that process. The app on port 3001 and the API on port 4000 were left running.

| Browser check | Result |
| --- | --- |
| Desktop, about 1920px, light and dark | Homepage, carousel, Coming soon promotion, and empty Mainboard sections rendered. Slide titles stayed white on the green artwork in dark mode. |
| Tablet, 768px | Calendar month grid, no horizontal overflow. The download bar sat above the bottom navigation. |
| Mobile, 390px, dark | Mobile banner image, one heading, no horizontal overflow, download bar above the bottom navigation. |
| Keyboard | Skip link is first in tab order. Carousel Arrow Right moved the slide and announced the title. Theme choices use arrow keys when that menu is open. |
| Direct reload | Homepage reload kept the saved dark theme and the same heading. |
| Back and Forward | SME, then the open Mainboard filter, then Back to SME and Forward to the filter. |
| Search | Submitting "mills" opened `/search?q=mills` and said no stored IPO matches. No sample company was inserted. |
| Missing IPO | `/ipos/not-a-real-issue` title "IPO not found", heading "This IPO page is not available". |

Internal links collected from the homepage, both boards, listed history, calendar, compare, search, allotment, and the information pages all returned HTTP 200. `/calendar` and `/ipos` return 308 to `/ipo-calendar` and `/ipos/mainboard`, and they keep the query string.

## Known bugs

No functional defect from this pass required a code change.

These behaviors are real and should stay visible:

- A missing IPO URL is noindex and still returns HTTP 200. Partial rendering postpones the response (`x-nextjs-postponed: 1`), so the status does not become 404. Search Console should exclude these URLs. Do not redirect a removed IPO to another company.
- With the database unset, list routes show an empty catalogue, not an error. An unavailable database is a different API response and the site shows an error instead of sample issues.
- The homepage and board pages still request each IPO document after the summary page. That is server-side traffic to the IPO Singh API, not a browser call to IPO Guru.

## API integration status

The API process on port 4000 answered on 23 October 2026:

```text
GET /api/v1/health  status ok
GET /api/v1/ready   status ready
  database  not_configured
  cache     not_configured
  provider  not_configured
  jobs      not_configured
GET /api/v1/ipos    items empty, totalCount 0
```

Readiness stays ready outside production when the database is unset. The public pages therefore show empty stored lists. They do not show live GMP, subscription, financials, or listing gains, because nothing is stored.

IPO Guru is disconnected. No provider credential is configured on this API process, so this audit made no provider request and spent no quota. Public pages never call `ipoguru.in`. Search suggestions stop at `/api/search` on the website, which reads the IPO Singh API on the server.

A licensed sync still has to run before the catalogue, GMP history, subscription history, and registrar links contain live issues. See `docs/ipoguru-integration-report.md` and `docs/ipoguru-request-budget.md`.

## SEO readiness

With `IPO_SINGH_SITE_URL=http://127.0.0.1:3026` on the serving process:

- Homepage, Mainboard, SME, calendar, listed history, compare, allotment, and the information pages are indexable, with absolute canonical URLs and an Open Graph image on that origin.
- Filtered board, listed, calendar, and compare URLs are noindex and point their canonical at the clean landing page.
- Search, account, watchlist, design-system, `/gmp`, and `/subscription` are noindex. Account, watchlist, design-system, `/gmp`, and `/subscription` are also nofollow.
- `robots.txt` allows `/` and disallows `/search`, `/account`, `/watchlist`, `/design-system`, `/gmp`, `/subscription`, `/api/`, and `/*?`. It publishes the sitemap URL.
- `sitemap.xml` lists the 12 stable public paths. It has no IPO detail URLs while the catalogue is empty, and it has no filter, month, search, or comparison URLs.
- Structured data is emitted only when the site URL is set. It does not add reviews, ratings, or prices that are not stored.

The serving process must have `IPO_SINGH_SITE_URL`. A value present only for `next build` leaves dynamic canonicals relative, points Open Graph images at `localhost`, omits the sitemap line from `robots.txt`, and returns an empty sitemap. `next start` does not inherit a variable that was prefixed only onto `next build`.

Google Search Console is not set up. That waits for the real https origin. See `docs/seo-checklist.md`.

## Performance findings

Local production responses were small and fast (homepage HTML about 90 KB, first response about 30 ms on this machine). That is not a field Core Web Vitals result.

- Public HTML is sent with `Cache-Control: private, no-cache, no-store`. A CDN cannot cache the document. That matches the current dynamic catalogue reads.
- The homepage references about 700 KB of uncompressed JavaScript across its chunks. The largest chunk, about 392 KB, is loaded on the IPO detail route and is not in the homepage document. Chart code stays off the list pages.
- The font is preloaded, `display: swap`, with a fallback adjustment. Promotion images use `picture` with a desktop source at 768px and lazy loading on offscreen slides. The carousel box keeps a fixed aspect ratio.
- Cumulative layout shift on the earlier promotion check was 0. This pass did not repeat a lab Lighthouse run.

## Security-sensitive frontend configuration

- Client bundles under `apps/web/.next/static` contain no `ipoguru`, `MONGODB_URI`, `IPOGURU_`, `REDIS_URL`, or `IPO_SINGH_API_ORIGIN` strings.
- `IPO_SINGH_API_ORIGIN` is read in server modules. The browser calls `/api/search` on the same origin.
- Store URLs are optional public https links. Empty or invalid values stay Coming soon. They are not invented.
- The website response has no `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`. It does send `X-Powered-By: Next.js`. The API process uses Helmet. A strict content security policy needs a nonce for the theme and app-promotion scripts before it can be turned on.
- Allotment links reject credentials and non-official hosts before they are rendered.

## Missing production configuration

Set these on the deployed web process before launch:

- `IPO_SINGH_SITE_URL` — public https origin, no path, query, or credentials.
- `IPO_SINGH_API_ORIGIN` — the IPO Singh API. Not an IPO Guru host.
- `IPO_SINGH_PLAY_STORE_URL` and `IPO_SINGH_APP_STORE_URL` — leave empty until each app is published.

Set these on the API and worker before live data:

- MongoDB URI for the IPO Singh database. Do not point development at production data.
- Redis, if catalogue reads should be cached.
- IPO Guru API v2 credentials and `IPOGURU_ENABLED` only on the worker, after the commercial licence is confirmed.
- Operations token for the protected status route.

Then confirm Search Console, the sitemap, and one real IPO detail URL on the deployed origin.

## Remaining tasks before launch

1. Configure MongoDB, run a licensed sync, and confirm one real Mainboard issue, one SME issue, GMP in rupees and percent, GMP history, subscription history, financials, a registrar link, and a listing gain on the deployed site.
2. Set `IPO_SINGH_SITE_URL` on the web server and submit the sitemap in Search Console.
3. Confirm the IPO Guru plan, credit line, and daily quota before raising refresh frequency.
4. Add baseline website security headers, then a content security policy that still allows the inline theme and promotion scripts.
5. Decide whether public HTML can be cached once the catalogue freshness rules are fixed.
6. Leave advertising billing and Google AdSense until those products exist. Account sign-in is email and password, and a watchlist stores IPO ids for that account. Email verification and password reset wait for an email provider. See `docs/auth-architecture.md`.
7. Publish the mobile apps before replacing Coming soon with store links.

The site is ready to deploy as an empty, truthful catalogue. It is not ready to present live IPO data until the database and the licensed sync are in place.
