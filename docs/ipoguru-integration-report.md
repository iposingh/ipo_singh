# IPO Guru Pro integration report

Verification date: 21 October 2026.

This report checks the IPO Guru API v2 integration that IPO Singh has implemented. It does not call `https://www.ipoguru.in/api/v2`. No API key is configured in this workspace, in the process environment, or in an env file. `IPOGURU_CONNECTIVITY_TEST` is not set, so the live connectivity test stays skipped. Live plan, scope, limit, and remaining-quota figures are pending.

Related docs: `docs/ipoguru-v2-integration.md`, `docs/ipoguru-field-mapping.md`, `docs/ipoguru-request-budget.md`, `docs/data-rights-checklist.md`, `docs/sync.md`.

## Active provider configuration

| Setting | This workspace |
| --- | --- |
| `IPO_DATA_PROVIDER` | Unset. The worker stays idle. |
| `IPOGURU_ENABLED` | Unset. The client is disabled. |
| `IPOGURU_API_KEY` | Absent. |
| `IPOGURU_BASE_URL` | Unset. The client default is `https://www.ipoguru.in/api/v2`. |
| `IPOGURU_MINUTE_BUDGET` / `IPOGURU_DAILY_BUDGET` | Unset. |
| `MONGODB_URI` / `REDIS_URL` | Unset in this workspace. |
| Application quota | 30 requests/minute, 1,000/day, 50 reserved. These are application ceilings, not a purchased plan. |
| Sync tick | Every 60 seconds, at most 8 upstream calls. |
| Retries | 2, with backoff from 200 ms to 5 seconds. The circuit opens after 5 failures for 30 seconds. |

`GET /me` is available only on `GET /internal/ipoguru/account` when the client is enabled and `X-Ops-Token` matches `OPS_TOKEN`. It is not on the public site and not on the sync hot path.

## Implemented endpoints

The worker calls these v2 paths when `IPO_DATA_PROVIDER=ipo-guru` and `IPOGURU_ENABLED=true`. Public pages do not.

| Endpoint | When |
| --- | --- |
| `GET /me` | Protected account probe only. |
| `GET /ipos?months=0` | Catalogue, once per 24 hours. |
| `GET /gmp` | One collection for open and upcoming issues. Default every 90 minutes, allowed range 60–120. |
| `GET /ipos/{slug}/gmp/history` | One GMP history document per due issue. `trend` is daily. `timeline` is intraday when the plan includes it. |
| `GET /ipos/{slug}/subscription` | Current subscription. Open issues every 60 minutes. |
| `GET /ipos/{slug}/subscription/history` | Day-wise subscription history, on the history interval. |
| `GET /ipos/{slug}` | One issue document on the financial interval. Company, financials, promoters, documents, and registrar need `details_full`. |

Not called: `GET /ipos/{slug}/gmp`, anchors, OFS, unlisted, and any v1 path. Adapter methods stay `notConnected` so the mock planner does not issue a second call.

## Verified capabilities

Live `/me` was not run. The rows below are what the mocked client, mappers, worker tests, and website checks cover.

| Capability | Result |
| --- | --- |
| `/me` plan, scopes, per-minute limit, daily limit, remaining quota | Pending. The connectivity test asserts a string plan, a scope list, and numeric limits, and it refuses to write the key. It skips until `IPOGURU_CONNECTIVITY_TEST=1` and a key are present. |
| Subscription history access | Mapper and worker tests accept a Pro-shaped history document. A 402 `plan_upgrade_required` is not retried and waits out the listed history interval. Live access is pending. |
| Intraday GMP | The history mapper stores Pro `timeline` points as Asia/Kolkata civil time. An empty `timeline` with `locked` stays an empty series. Live access is pending. |
| Mainboard and SME catalogues | One list response stores both boards. SME is not inferred from issue size. |
| IPO details | One detail document stores timeline, offer terms, refund and demat dates, narrative, promoters, objects, documents, and listing. A Free response that omits `company` keeps the last narrative. |
| Current GMP and percentage | The collection poll matches slugs. Stored percent is recomputed from the premium and the applicable issue price. Zero stays zero. A failed parse stays null. |
| GMP history | One URL per due issue. A completed closed, allotment, or listed window is not fetched again. Missing days are not filled with zero. |
| Subscription breakdown | Total, QIB, NII, retail, employee, shareholder, and anchor are stored when sent. Subcategories such as bNII and sNII stay on their parent. `"0"` is 0x. A blank multiple is unavailable. |
| Company financials | Source rows keep their metric, headers, and unit. The published `Assets` row is not copied into revenue, profit, or EPS. Prose is shown when there are no rows. |
| Registrar references | A vendor `status_page` is stored only when its host and path are an official KFin, MUFG Intime, or Bigshare allotment page. A registrar name does not invent a URL. |

Normalized records were compared with fixture documents inside the mapper tests. Raw vendor bodies are not stored and are not returned by the public API.

## Request consumption

Counts use the configured schedules. They are logical successful calls. Retries and `GET /me` are extra. The open GMP interval of 30 minutes in the phase table is not used: current GMP is the collection poll.

| Schedule | Open | Upcoming | Listed | Other |
| --- | ---: | ---: | ---: | ---: |
| Catalogue list | 1/day for the whole book | same | same | same |
| `GET /gmp` collection | 16/day at 90 minutes | same | not in this poll | not in this poll |
| Current subscription | 24/day | 4/day | 1/day | 1/day |
| GMP history | 4/day | 1/day | once, then stop | once, then stop |
| Subscription history | 4/day | 1/day | once, then stop | once, then stop |
| Issue document | 1/day | 1/7 day | 1/7 day | 1/7 day |

A stale or missing open/upcoming GMP shortens the collection poll to 60 minutes (24/day) while day budget remains. That is the only automatic shortening. Intervals were not made shorter in this verification.

Illustration, not a live census: 5 open, 8 upcoming, 10 listed, 6 other.

| Bucket | Calls/day after settled history | Calls/day while listed and closed history are still due |
| --- | ---: | ---: |
| Catalogue | 1 | 1 |
| GMP collection | 16 | 16 |
| Current subscription | 168 | 168 |
| GMP history | 28 | 35.4 |
| Subscription history | 28 | 35.4 |
| Issue documents | 8.4 | 8.4 |
| Total | 249.4 | 264.3 |

249 fits Standard (1,000/day, 950 after the 50-request reserve) and Pro (3,000). It does not fit Free (10) or Basic (250).

An open issue costs 32 calls on a bidding day: 24 current subscription, 4 GMP history, and 4 subscription history, plus its detail document. About 27 open issues fit under the 950 usable Standard calls once the illustration's upcoming, listed, and other traffic is included. Thirty open issues, with both history feeds still refreshing, pass 1,000 before catalogue and GMP.

### Quota bottlenecks

- Current subscription for open issues is the largest line. The 60-minute start is what keeps it inside a 1,000/day plan. It was not shortened.
- The application minute ceiling is 30. Standard is 20 and Basic is 10. A worker left on the default can pass the local gate and still receive a vendor 429 on Standard.
- One tick allows 8 calls, which fits Standard and Basic for a single minute. Two ticks that share a clock minute are 16 calls. That still fits Standard and exceeds Basic.
- Two retries can turn 8 logical calls into 24 HTTP requests. That exceeds Standard's 20/minute while the provider is failing.
- Subscription history on a plan without `subscription_history` returns 402. The worker then waits out the listed history interval instead of calling it every tick. Those 402s still count until the backoff starts.
- Intraday GMP needs Pro. A lower plan returns an empty `timeline` and does not add a second URL.
- Do not raise `SYNC_MAX_CALLS_PER_TICK` or shorten an interval because unused quota remains.

## Cache effectiveness

Verified by the cache and sync tests, not by a live Redis.

- A public read records a miss, then a fresh hit. A fresh hit does not spend provider quota.
- Concurrent callers share one origin load. A second caller waits for the lock holder.
- A cache-miss storm stops before another origin call.
- When the origin fails, the last value is returned and labeled stale.
- Provider and public cache entries are separate. A successful sync drops both so the next read loads the stored rows.
- Catalogue, board, and detail pages read IPO Singh's API. That API reads MongoDB and Redis. Ordinary page views do not call IPO Guru. The web client rejects an `ipoguru.in` origin before a request.

MongoDB persistence tests store catalogue rows, observations, statements, registrars, and documents idempotently, and they reject a raw provider payload. No production database was used.

## Data completeness

Present when the vendor sends them: board, status, price band, lot, minimum investment, issue size, open and close dates, allotment, refund, demat credit, listing date, GMP, subscription categories, source financial rows or prose, registrar name, verified allotment URL, RHP/DRHP/anchor/basis documents, listing price, recomputed listing change, CMP, and current gain.

Left unmapped because the published schema does not give them a safe shape: promoter holding pattern, company KPIs, face value, sale type, exchange symbol, anchor book, OFS, unlisted quotes, kostak, subject-to-sauda, application counts, and QIB interest cost. Missing values stay null. They are not filled with zero.

## Website

Checked on the production build at `127.0.0.1:3025` with the API unreachable, plus the labeled design-system sample. Live catalogue rows were not available.

| Check | Result |
| --- | --- |
| Homepage | Mainboard is the default. With the API down it says the catalogue could not be loaded and does not insert sample issues. The calendar stays empty. |
| SME page | Separate from Mainboard. The same API failure says the list could not be loaded and is not an empty count of zero. |
| Search | `/search` asks for an issue name. `/search?q=forge` keeps the query and shows the catalogue error. The mobile menu form submits to `/search?q=forge`. |
| IPO detail | `/ipos/sample-detail` says the IPO could not be loaded. Sample GMP, subscription, financials, allotment, and listing stay on the design-system page and are labeled as samples. |
| GMP ₹ and % | The sample shows ₹125 (+18.52%), ₹0 (0.00%), a negative premium, and "GMP unavailable". |
| Charts | GMP and subscription samples leave the missing day unconnected. Zero and negative points stay on the chart. |
| Financials | Assets stay labeled Assets, with 1,508.24 and 1,321.64. The SME sample stays prose. A missing statement stays empty. |
| Registrar redirect | Check Allotment points at `https://ipo.bigshareonline.com/ipo_status.html` with `target="_blank"` and `rel="noopener noreferrer"`. The unofficial registrar button is disabled. The allotment page has no PAN or application-number field. |
| Mobile | At a 390px layout width the homepage and SME page match the viewport. Detail tables are 640px inside a 356px scroller. The page itself does not scroll sideways. |
| Light and dark | The theme control switched the page to light (`color-scheme: light`) and back to dark. |
| Loading and empty | Search, browse, and detail expose empty and error states. A failed load is not an empty catalogue. |
| Source and last updated | The subscription sample shows source "IPO Guru Pro", last updated in IST, and a "Data by IPO Guru" link to `https://www.ipoguru.in/` with an empty `rel`. |
| Search Suspense warning | The production build and requests to `/search` and `/search?q=forge` did not print a `useSearchParams` Suspense warning. The server log shows only the existing `metadataBase` warning. |

## Security

| Check | Result |
| --- | --- |
| API key in the frontend bundle | No key exists to leak. The web build does not contain `IPOGURU_API_KEY`, `X-API-KEY`, or `NEXT_PUBLIC_IPOGURU`. The web client refuses an IPO Guru origin. |
| Secrets in logs | Client tests assert the key and the header name are absent from log lines and from the account snapshot serialization. |
| Raw commercial feed | Persistence rejects a raw provider payload. Public JSON is the IPO Singh document. |
| PAN | The detail page states that IPO Singh does not collect PAN or an application number. There is no PAN field. Request guards reject PAN-shaped input. |
| Errors | 401, 402, 403, 404, and 422 are not retried. A 5xx or network failure stays an outage and does not clear stored rows. Public errors do not echo the rejected value. |
| Rate limiting | Catalogue, search, and detail reads are rate limited. Health stays available. |
| Attribution | The credit link has no `nofollow` or `sponsored` relation. |

## Licensing items requiring confirmation

1. The purchased plan, and that it is paid if the site is commercial. Free is evaluation only.
2. `PROVIDER_REQUESTS_PER_MINUTE` and `PROVIDER_REQUESTS_PER_DAY` set to that plan before `IPOGURU_ENABLED=true`. The current 30/minute default is above Standard.
3. One key, stored only on the API and worker. It is not committed.
4. The "Data by IPO Guru" link remains visible on every page that shows live figures.
5. Commercial presentation stays indicative. GMP is not a listing prediction.
6. Raw responses are not republished. Cached pages stay IPO Singh documents with the credit.

## Known limitations

- Live `/me`, catalogue, GMP, subscription, financials, and registrar responses were not fetched.
- Remaining daily quota is unknown.
- Whether this key includes `subscription_history` and `gmp_intraday` is unknown.
- `metadataBase` is still `http://localhost:3000`.
- Anchor, OFS, and unlisted products are not integrated.
- The older arithmetic in `docs/ipoguru-request-budget.md` still shows a rejected 15-minute subscription rate and a 30-minute GMP line. The consumption table in this report is the configured schedule.

## Remaining work before production

1. Put the key in the API and worker environment and set `IPOGURU_CONNECTIVITY_TEST=1` for one authorized `/me`. Record the plan, scopes, per-minute limit, daily limit, and remaining quota. Do not log the key.
2. Set the application minute and day ceilings to that plan, with the reserved pool inside the day ceiling.
3. Confirm the commercial licence and the credit link on a page that shows live figures.
4. Provide `MONGODB_URI`, `REDIS_URL`, `CORS_ORIGINS`, and `OPS_TOKEN`. Keep `IPO_DATA_PROVIDER=mock` rejected in production.
5. Run the worker as its own process. Do not start it from a page view.
6. Set a production `metadataBase`. Do not raise refresh frequency to use spare quota.

## Checks run

Typecheck, lint, tests, and production builds passed on 21 October 2026.

| Suite | Result |
| --- | --- |
| API | 162 passed. The live connectivity test does not run without `IPOGURU_CONNECTIVITY_TEST=1` and a key. |
| Web | 22 passed, including the IPO Guru source-credit check. |
| Contracts | 5 passed. |
| Core | 19 passed. |
| Design tokens | 2 passed. |
| Web bundle scan | `apps/web/.next`, excluding source maps, has no `IPOGURU_API_KEY`, `X-API-KEY`, or `NEXT_PUBLIC_IPOGURU`. |
