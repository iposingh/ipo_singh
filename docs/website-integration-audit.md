# Public website integration audit

Audit date: 21 October 2026.

The public site is `apps/web`. It reads IPO Singh's API (`IPO_SINGH_API_ORIGIN`, default `http://127.0.0.1:4000`). It does not call IPO Guru. Shared response shapes live in `@ipo-singh/contracts`. Calculations live in `@ipo-singh/core`.

Related docs: `docs/api.md`, `docs/backend-readiness.md`, `docs/ipoguru-integration-report.md`.

## Existing routes

| Route | Role | Data source |
| --- | --- | --- |
| `/` | Mainboard-first homepage: open, upcoming, recently closed, recently listed, plus a calendar preview | `GET /api/v1/ipos?board=mainboard`, then each issue, and `GET /api/v1/calendar` |
| `/ipos/mainboard` | The same four Mainboard sections. A status, search, or custom sort opens one paginated list | Same board read, filtered in the server component |
| `/ipos/sme` | The same four SME sections, kept separate from Mainboard | `GET /api/v1/ipos?board=sme`, then each issue. A summary is kept only when its `board` is `sme` |
| `/ipos/[slug]` | Overview, timeline, GMP, subscription, financials, documents, allotment, listing | `GET /api/v1/ipos/{slug}`, GMP history, and subscription history |
| `/search` | Name, symbol, and slug search | `GET /api/v1/search`, then each matching issue |
| `/calendar` | Open, close, allotment, and listing dates | `GET /api/v1/calendar` |
| `/gmp` | Points to the IPO lists. GMP stays on the IPO page | No catalogue call |
| `/subscription` | Points to the IPO lists. Subscription stays on the IPO page | No catalogue call |
| `/allotment` | Explains that Check Allotment lives on the IPO page. No PAN form | No catalogue call |
| `/compare` | Placeholder. Comparison is not available yet | No catalogue call |
| `/watchlist`, `/account` | Future features, marked Soon | No catalogue call |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | Static information | No catalogue call |
| `/design-system` | Internal sample layout. Figures are labeled as samples | No catalogue call |

Primary navigation, the mobile menu, the bottom bar, and the footer all point at routes that exist. `/gmp` and `/subscription` exist and are not in the primary navigation, because those figures belong on the IPO page.

## Backend connectivity

The typed client is `apps/web/lib/api/ipo-singh.ts`. Pages call it from server components in `apps/web/features/ipos/catalog.ts`. `React.cache` wraps the board, detail, search, and calendar loaders so one request does not repeat the same read. `connection()` keeps those pages dynamic. Requests use `cache: "no-store"`.

The client accepts only `http` and `https` origins without credentials. A host of `ipoguru.in` is refused before `fetch`.

| Public API | Used by the site |
| --- | --- |
| `GET /api/v1/ipos` | Board lists and the homepage |
| `GET /api/v1/ipos/:slug` | Cards, search hits, and the IPO page |
| `GET /api/v1/ipos/:slug/gmp/history` | IPO page |
| `GET /api/v1/ipos/:slug/subscription/history` | IPO page |
| `GET /api/v1/search` | Search. A query shorter than 2 characters is not sent |
| `GET /api/v1/calendar` | Calendar page and the homepage preview |
| `GET /api/v1/ipos/:slug/gmp` | Not called. Current GMP is on the IPO document |
| `GET /api/v1/ipos/:slug/subscription` | Not called. Current subscription is on the IPO document |
| `GET /api/v1/ipos/:slug/financials` | Not called. Statements are on the IPO document |
| `GET /api/v1/ipos/:slug/registrar` | Not called. The registrar is on the IPO document |

Search used to download both full catalogues and filter them in the website. It now uses `GET /api/v1/search` and hydrates only the returned slugs. The calendar page used to say it was not connected. It now reads `GET /api/v1/calendar`.

An unreachable API, a non-200 response, or a body that fails the contract becomes `unavailable`. The page shows an error and does not insert sample issues. An empty `items` array stays an empty list. A slug of `404` stays a missing IPO, with empty sections.

## Data completeness

Shown when the stored IPO document includes them:

- Board and status. Mainboard and SME are the stored `board`, not issue size.
- Price band, lot size, minimum investment, and issue dates.
- GMP in rupees and the derived percent. Zero stays zero. A missing premium stays unavailable.
- Subscription categories and day-wise history. A published zero stays 0x.
- Source financial rows, with their metric and unit, or prose when the source has no rows.
- Documents, a verified registrar allotment link, listing price, and the recomputed listing change.

Freshness and attribution: cards and IPO sections show the provider observation time in Asia/Kolkata. A source name that includes IPO Guru also shows a normal "Data by IPO Guru" link. GMP history and subscription history keep their own retrieved time. A failed history read leaves the current IPO in place and marks that history unavailable.

The list summary does not include the price band, lot, listing date, allotment date, or GMP percent. Board and search pages therefore request each IPO document before rendering a card.

## Known issues

- Board pages still request every IPO after the summary page. That is one list call plus one detail call per issue, in batches of four. It is not a browser call to IPO Guru.
- Search shows at most five pages of 20 matches, then says more matches were not loaded.
- The calendar shows at most ten pages of 100 dates, then says more dates were not loaded.
- `/compare`, `/watchlist`, and `/account` are still placeholders.
- `/gmp` and `/subscription` do not list market-wide totals. That is intentional.
- `metadataBase` is still unset and falls back to localhost during the production build.
- Live IPO Guru plan, scopes, and quota remain pending. See `docs/ipoguru-integration-report.md`.
- `features/ipo-details/history-chart.tsx` is unused. GMP and subscription charts are the ones on the IPO page.
- With the API stopped, the homepage shows a catalogue error and a calendar error. Both are real failed reads.

## Components needing refinement

- `IpoCard` and `IpoTable` need the full IPO document. A richer summary would let lists skip the per-issue read.
- `history-chart.tsx` can be removed once nothing is expected to import it. It is not wired to a page.
- Compare needs a real two-issue layout. It should keep using stored IPO documents and should not invent a winner.
- The design-system page is the sample gallery. It must stay labeled as sample data and must not be linked as a market page.
- Detail `generateMetadata` uses the same cached loader as the page. The title is the company name when the IPO loads, and "IPO" when it does not.

## SEO and rendering

Indexable pages are server components. Client components are limited to interaction: navigation, the mobile menu, theme, dialogs, and chart point selection. The initial IPO content is in the server render.

Search, board filters, the calendar, and the IPO page sit behind Suspense because they read request data. The production build does not print a `useSearchParams` warning. The search page awaits `searchParams` inside that boundary.

Pages do not fetch in the browser, so a public page view does not call IPO Guru and does not repeat the server read on the client.

## Implementation priorities

1. Extend the public summary so a card can render without a second request per IPO.
2. Set a production `metadataBase` when the domain is known.
3. Build comparison from stored IPO documents.
4. Leave accounts and the watchlist until sign-in exists.
5. Confirm the IPO Guru licence and credit on a page that shows live figures before production. Do not raise refresh frequency to spend spare quota.

## Checks

Typecheck, lint, tests, and production builds passed on 21 October 2026.

| Suite | Result |
| --- | --- |
| API | 162 passed. The live connectivity test stays skipped without a key and `IPOGURU_CONNECTIVITY_TEST=1`. |
| Web | 24 passed, including search and calendar client tests. |
| Contracts | 5 passed. |
| Core | 19 passed. |
| Design tokens | 2 passed. |

The production build did not print a `useSearchParams` Suspense warning. It still warns that `metadataBase` is unset. `/`, `/calendar`, `/search`, `/ipos/mainboard`, `/ipos/sme`, and `/ipos/[slug]` are server-rendered with dynamic content. The other public routes are static.
