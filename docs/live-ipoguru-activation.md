# IPO Guru Pro live activation

Checked on 28 October 2026. The private API key stayed in `apps/api/.env`. It was not printed, copied, or committed. `.gitignore` ignores `.env*` and keeps `.env.example`.

## 1. Authentication

`GET /me` succeeded through the backend client and the `X-API-KEY` header. The account document matched the existing account schema.

- Plan: `pro` / Pro
- Lapsed: false
- Expiration: 28 November 2026
- Scopes included calendar, details, details_full, gmp, gmp_history, gmp_intraday, subscription, subscription_history, anchors, ofs, and unlisted
- Provider limits on the account: 40 requests/minute and 3,000 requests/day
- The first account read reported 3 requests used that day and 2,997 remaining. Later probes and the one-shot used more requests. Usage was not read again after the one-shot.

## 2. Plan and quota

The Pro ceilings in the environment are `IPOGURU_MINUTE_BUDGET=40` and `IPOGURU_DAILY_BUDGET=3000`. Application quotas stay at 30 requests/minute and 1,000 requests/day. The client uses the lower of the two, so the effective ceilings are 30/minute and 1,000/day. The provider quota resets at midnight Asia/Kolkata.

`IPO_DATA_PROVIDER=ipo-guru` and `IPOGURU_ENABLED=true`. The base URL is `https://www.ipoguru.in/api/v2`. The key is present and accepted by the sealed configuration. The process environment still overrides `apps/api/.env`.

## 3. Endpoint matrix

| Path | Client | Normalizer | Stored | Polled | Public UI |
| --- | --- | --- | --- | --- | --- |
| `GET /me` | Yes | Account schema | Usage metadata only | Account probe, not the catalogue tick | No |
| `GET /ipos` | Yes | Catalogue mapper | IPO and company rows | Yes, daily | Mainboard and SME lists, calendar, search |
| `GET /ipos/{slug}` | Yes | Detail mapper | Profile on the IPO | Yes, on the financial interval | IPO detail |
| `GET /gmp` | Yes | Current GMP collection | GMP observations for matched issues | Yes, every 90 minutes | GMP on each IPO |
| `GET /ipos/{slug}/gmp` | Yes | Not used for the routine poll | No separate store | No | No |
| `GET /ipos/{slug}/gmp/history` | Yes | Daily and intraday history | GMP observations and history window | Yes, history interval | GMP history |
| `GET /ipos/{slug}/subscription` | Yes | Category mapper | Subscription observations | Yes | Subscription section |
| `GET /ipos/{slug}/subscription/history` | Yes | Day-wise mapper | Subscription observations | Yes | Subscription history |
| `GET /ipos/{slug}/anchors` | Yes | Anchor mapper | Optional profile field when investors exist | With the detail refresh for open and upcoming issues only | Subsection when rows exist |
| `GET /ofs` | Yes | OFS list mapper | `ofs_issues` model, nothing written | No | No |
| `GET /ofs/{slug}` | Yes | OFS detail mapper, including the bid book | Same model | No | No |
| `GET /unlisted` | Yes | Indicative-quote mapper | `unlisted_shares` model, nothing written | No | No |
| `GET /unlisted/{slug}` | Yes | Detail quote and price history | Same model | No | No |

Documented query keys `type`, `status`, `search`, `months`, `limit`, and `days` are now forwarded. A key in the query string is still refused.

## 4. Real data availability

A limited live sample, not a full backfill, showed:

- The directory returns real Mainboard and SME rows. Status values include open, upcoming, closed, and listed.
- `GET /gmp` returns the current collection, including closed rows. The mapper still attaches a reading only to an open or upcoming stored issue.
- One open issue returned GMP history with both daily `trend` points and Pro `timeline` points. Missing slots were not filled.
- The same issue returned QIB, NII, retail, employee, shareholder, total, and anchor categories, plus bNII and sNII subcategories. Null subcategory multiples stayed null. Published zeroes stayed 0x.
- Its subscription history document used `day_wise`.
- Its anchor book had investor rows. Amounts stay in ₹ crore.
- Its company documents were present as keys and the URLs were null, so no document links were stored.
- Its promoter array was empty. A short `promoters_text` string is now kept as narrative instead of being split into invented names.
- OFS list and one OFS detail returned. The bid book is separate from IPO subscription.
- The unlisted directory had 206 indicative dealer quotes. Detail history keeps the provider timestamps. `price_type` was `indicative_dealer_quote`.

## 5. Normalization fixes

- The HTTPS transport had been dropping every query string and rejecting those URLs before the request. Catalogue filters such as `months=0` never reached IPO Guru. Documented filters are now sent, and the body limit is 2,000,000 bytes.
- The client can call the per-IPO GMP, anchors, OFS, and unlisted paths. A malformed slug is rejected before a quota slot is taken.
- Anchor rows, promoter narrative, OFS issues, and unlisted indicative quotes have typed mappers and tests.
- OFS is not given a Mainboard or SME board. Unlisted quotes are rejected unless they are indicative dealer quotes.
- Book sizes whose unit was not published are not stored as rupees.

## 6. MongoDB

Prompt 54A wrote the first live sync into local MongoDB at `127.0.0.1:27017`, database `ipo-singh-dev`. That local database was left unchanged.

Prompt 54B uses the Atlas URI already stored in `apps/api/.env`. The URI is `mongodb+srv` and has no database path. In development and test, a missing path selects `ipo-singh-dev`. Production still rejects a URI with no database name. The file is gitignored. `loadLocalEnv` does not run when `NODE_ENV` is `production`, and an existing process variable still wins over `.env`.

Atlas authenticated, answered a database ping, and accepted a write that was then deleted. It was empty, so the local IPO collections were copied with upserts on `_id`. Local counts were the same after the copy. Atlas then held:

| Collection | Documents |
| --- | ---: |
| IPOs | 352 |
| Mainboard | 151 |
| SME | 201 |
| Companies | 352 |
| GMP observations | 304 |
| Subscription observations | 6 |
| Sync runs | 8 |

Statuses: 7 open, 7 upcoming, 1 allotment, 337 listed. No duplicate slugs. Indexes exist for slug, board, status, and the open, close, allotment, and listing dates. `ofs_issues` and `unlisted_shares` have indexes and zero documents. Anchor profiles were not in the copied set.

## 7. Redis

Prompt 54A had no Redis. The one-shot used a process-local cache and lock, and cache invalidation logged `CachePolicyError`.

Prompt 54B uses the Redis Cloud URL already stored in `apps/api/.env`. The scheme is `redis://`, so the client stays on the provider's non-TLS endpoint. It is not rewritten to `rediss://`, and certificate checks are not disabled. PING returned PONG. A namespaced probe was written, read, deleted, and expired by TTL. Catalogue invalidation removed its key. Two workers could not hold `ipo-singh:sync-lock` at once, and the owner could release it. After a disconnect, the same client connected again. The API readiness check reports cache `ok`. The client retries a dropped connection up to eight times and then stops.

This endpoint is development-only. TLS is off, and the provider allow list is off, so the database is not on a private network. Do not put production secrets, sessions, authentication tokens, or other sensitive user data in it. Account sessions stay in MongoDB. Redis holds the public catalogue cache, quota counters, and sync locks. Do not treat a successful PING as approval for production. The recurring worker was not started.

## 8. One-shot synchronization

`npm run sync:once` ran once, with `SYNC_MODE=once`, a development database, and a process-only sync token. Production safeguards stayed on. The tick stopped at 8 provider calls:

1. `GET /ipos?months=0`
2. `GET /gmp` (13 open or upcoming readings matched)
3. Six current subscription reads

GMP history, subscription history, issue detail, and anchors did not fit in that tick. They remain due. The command exited 0. No second tick was run.

## 9. Website

The API is serving the development database on `127.0.0.1:4000`. The site was started on `127.0.0.1:3001` with `IPO_SINGH_API_ORIGIN` pointed at that API. The browser does not call IPO Guru.

The IPO detail page for the open Mainboard issue M.K.Sons Fine Jewels showed IPO Guru Pro as the source, GMP ₹16 (9.88%), an indicative price of ₹178, a stale label, and subscription total 0.65x. Employee and shareholder were 0x. bNII was 1.72x and sNII was 0.14x. Missing subcategory multiples stayed unavailable. Financials, documents, intraday GMP, and day-wise subscription history showed empty states because those reads were not in the one-shot. The anchor subsection stays hidden until investor rows are stored.

The homepage calendar showed stored issues, including BMW Ventures and Epack Prefab Technologies. During 54A the Mainboard card list did not load. The site loaded one detail document per issue, and the detail rate limit is 60 requests per minute. A 151-issue board exceeded that limit, and one denied detail failed the whole list. No mock issues were substituted.

Prompt 54B stops that pattern. Mainboard, SME, and the homepage request paginated IPO summaries from `GET /api/v1/ipos`. The summary contract is unchanged. One invalid card is skipped. A failed request is shown as backend, database, rate limit, or unexpected failure, not as an empty list. The default page is 20 records, with the total count, and search, status, and sort stay in the address. Price band, lot size, and listing price remain on the IPO page because they are not on the public summary. GMP amount, subscription total, freshness, and the IPO Guru credit are on the list.

The IPO calendar calls `connection()` before it reads the clock, so prerender no longer sees an unstable `new Date()`. The month grid uses fixed cells and event counts. The selected date opens a grouped agenda. List view, board filters, and event filters use the stored month. Dates stay on the India calendar.

## 10. Mobile API compatibility

The public list and detail contracts still parse. `promoterNarrative` and `anchors` are optional profile fields. Current mobile source can show them when they are present and keeps the existing section list. No simulator, device, or Expo bundle was run for this activation.

## 11. Synchronization schedule

Unchanged intervals:

- Catalogue: 24 hours
- Current GMP collection: 90 minutes
- Subscription: 60 minutes open, 6 hours upcoming, 24 hours listed and other
- GMP and subscription history: 6 hours open, 24 hours upcoming, 7 days listed; a settled issue is not fetched again after one success
- Issue detail: 24 hours open, 7 days otherwise
- Open and upcoming detail refreshes also request anchors. Listed and closed issues are not backfilled.
- Tick: 60 seconds, at most 8 provider calls
- OFS and unlisted are not scheduled

Per-issue `GET /ipos/{slug}/gmp` is not the routine poll.

## 12. Estimated daily request usage

After history for already settled issues has been fetched once:

| Job | Calls/day |
| --- | ---: |
| Catalogue | 1 |
| GMP collection | 16 |
| Current subscription | about 534 |
| Ongoing GMP history | about 35 |
| Ongoing subscription history | about 35 |
| Detail, including anchors for open and upcoming issues | about 64 |
| Total | about 685 |

That fits under the 1,000/day application cap and the 3,000/day Pro cap. The first catch-up of GMP history and subscription history for about 338 settled issues can add several hundred calls and push the first day over 1,000. The application cap stops the tick. The remainder waits for the next Kolkata day. The cap was not raised.

OFS and unlisted polling is not included. A full unlisted detail refresh would be 206 extra calls before any list refresh.

## 13. Known issues

- Company financials, documents, promoter narrative, anchors, GMP history, and subscription history are implemented but were not persisted by the single 8-call tick.
- `GET /gmp` includes closed issues. Only open and upcoming targets are updated from that collection.
- Redis Cloud has TLS off and no network allow list. It is suitable for this development cache and these locks only.
- For the sampled open issue, document URLs were null. That is empty source data, not a dropped URL.
- A previously stored notification can still show its old text after display is turned off, until it expires.

## 14. Licensing

Commercial display and backend storage are in use while the Pro subscription is active. This activation does not treat the feed as sublicensable or as a raw feed that can be redistributed.

To stop public display after the subscription ends, set `IPOGURU_DISPLAY=false` while `IPO_DATA_PROVIDER=ipo-guru`. Catalogue, search, calendar, watchlist issue names, and new notification catalogue reads then stay empty. Set `IPOGURU_ENABLED=false` as well so synchronization stops. The default remains display on, so this activation still shows stored rows.

Outstanding question: confirm with IPO Guru whether a lapsed subscription requires deletion of stored rows or only stopping public display.

## 15. Prerequisites for ongoing synchronization

1. Keep the API key only in the API process environment.
2. Keep the Atlas URI in `apps/api/.env` for development. Do not point a new process at the local database. Production must set `MONGODB_URI` in the process environment, including the database name, and must not rely on `.env`.
3. The recurring worker can be started manually for this development database. It will use Atlas and the same Redis lock namespace. Do not start it against this Redis endpoint for production. Leave application quotas at 30/minute and 1,000/day.
4. Expect the first history catch-up to span more than one quota day.
5. Do not add OFS or unlisted polling until their page and request budget are decided.
6. Turn on TLS, and a network allow list or private connectivity, before Redis is used outside development.
