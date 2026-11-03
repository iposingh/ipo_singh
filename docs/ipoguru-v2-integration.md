# IPO Guru API v2 integration audit

Audit date: 19 October 2026.

Source: the published reference at <https://www.ipoguru.in/ipo-gmp-details-developer-api>. Every path, parameter, field, scope, and limit below is taken from that page. This audit did not call `https://www.ipoguru.in/api/v2` and did not use an API key.

`/api/v1` was deprecated on 30 September 2026. A v1 request returns `v1_retired`. IPO Singh uses v2 only.

## Verdict

The existing provider boundary can host a v2 client later. It does not host one now.

`createIpoGuruProvider()` still marks every feature `unverified` and rejects with `ProviderNotConnectedError`. A method call does not open a socket. The worker still refuses `IPO_DATA_PROVIDER=ipo-guru` before the gateway. Web and mobile clients still have no path to IPO Guru.

The published reference is sufficient to implement calendar, detail, current GMP, day-wise GMP history, and current subscription. Intraday `recorded_at` is stored as Asia/Kolkata civil time because the captured example sits beside an IST slot. It is not sufficient to fill company financials, anchors, OFS, or unlisted shares into the current domain models. Those gaps are listed in `docs/ipoguru-field-mapping.md`.

## What the code already provides

| Piece | Role against v2 |
| --- | --- |
| `IpoDataProvider` | Backend-only methods. No anchors, OFS, or unlisted methods. |
| Capability `unverified` | Blocks the call. Fallback is not allowed for an unverified provider. |
| Quota gate | Application ceiling. Defaults are 30 requests/minute and 1,000/day, with 50 reserved. These numbers are not the vendor contract. See `docs/ipoguru-request-budget.md`. |
| Redis cache | Public reads do not spend provider quota. GMP and subscription TTLs are already longer than one vendor request. |
| Worker planner | One logical call per category, except history, which counts as two. IPO Guru is short-circuited. |
| Persistence | Slug, provider mapping (`providerKey` + `externalId`), source time, and freshness. Raw vendor payloads are not stored. |
| Gateway timeout | 8 seconds. The vendor's published client examples use 10 seconds. |

Financials, registrar details, and listing information are separate provider methods. On v2 they are blocks inside `GET /ipos/{slug}`, not separate URLs. A later client must fetch that document once and fan the blocks out. Calling the three methods as three HTTP requests would triple the quota cost.

`getGmpHistory` and `getIntradayGmp` are separate methods. v2 serves both from `GET /ipos/{slug}/gmp/history`. Day-wise `trend` requires `gmp_history` (Standard). Intraday `timeline` requires `gmp_intraday` (Pro). Below Pro, `timeline` is an empty array and `locked` names it.

## Transport

Base URL: `https://www.ipoguru.in/api/v2`

Every documented endpoint is `GET`, returns `application/json`, and is read-only. HTTPS is required. The reference describes no webhooks, no writes, and no SDK.

Authentication, server-side only:

- Header `X-API-KEY` is the production form.
- Query `api_key` is described for a quick browser test. The reference says query strings land in proxy and server logs, so production traffic must not use it.

Keys are long-lived and are not rotated automatically. One key per client. The same key is used on v2 after a v1 migration.

Success envelope:

- `success: true`
- `plan`: the plan that served the response
- Collections add `count` and `data` (array)
- A single resource returns `data` (object)

Response headers:

| Header | Meaning |
| --- | --- |
| `X-Plan` | Plan that served the response. |
| `X-RateLimit-Limit` | Daily quota. |
| `X-RateLimit-Remaining` | Requests left today. |
| `Retry-After` | Seconds to wait. Sent only on a burst 429. |

The reference says a burst limit and a daily quota apply together, the daily quota resets at midnight IST, and both are counted per key. The next clause on that page is cut off after "and". This audit does not complete that sentence.

## Plans and scopes

`GET /me` returns the scopes on the key. That call counts against the quota.

| Scope | Unlocks | Minimum plan |
| --- | --- | --- |
| `calendar` | IPO list | Free |
| `details` | IPO detail document | Free |
| `details_full` | Company, financials, promoters, documents, contacts | Basic |
| `gmp` | Current GMP | Free |
| `gmp_history` | Day-wise GMP trend | Standard |
| `gmp_intraday` | Intraday GMP timeline at 11:00, 17:00, and 22:00 IST | Pro |
| `subscription` | Live subscription by category | Standard |
| `subscription_history` | Day-wise subscription build-up | Pro |
| `anchors` | Anchor allocations | Standard |
| `ofs` | OFS issues and stored bid book | Pro |
| `unlisted` | Unlisted / pre-IPO prices | Pro |

| Plan | Requests / minute | Requests / day | Commercial use |
| --- | --- | --- | --- |
| Free | 1 | 10 | Evaluation and non-commercial only |
| Basic | 10 | 250 | Paid plans may be used commercially, with the credit link |
| Standard | 20 | 1,000 | Same |
| Pro | 40 | 3,000 | Same |

Published prices, annual billing included: Basic ₹99/month or ₹990/year, Standard ₹299/month or ₹2,990/year, Pro ₹499/month or ₹4,990/year. Annual billing waives two months. Keys above Pro are issued manually.

`limits.gmp_history_days` on the Standard `GET /me` example is `90`. The plan-catalogue field says `0` means the current reading only and `null` means no ceiling. No other plan's day ceiling is printed.

A Free detail response is HTTP 200 with paid blocks omitted and named in `locked`. It is not a 402. Below Pro, GMP `timeline` stays an empty array; other plan-gated blocks are omitted.

Allotment-by-PAN is not sold on any plan. The reference reserves it for the IPO Guru website and app.

## Endpoint catalogue

The introduction says "Twelve endpoints". The reference then prints twelve resource routes plus two account sections. The plan-catalogue section prints no path. This audit does not invent one.

### Bulk reads

| Method and path | Scope | Plan | Query | Use |
| --- | --- | --- | --- | --- |
| `GET /ipos` | `calendar` | Free | `type` `mainboard` or `sme` (case-insensitive). `status` `open`, `upcoming`, `closed`, or `listed` (any other value is 422). `search` matches name, display name, or slug. `months` defaults to 3; `0` means no date limit; ignored when `search` is set. `limit` is applied per board, then to the merged rows. | Whole calendar, including a GMP block and `subscription_total`. No pagination. Sorted by `open_date` descending. Pre-RHP rows (`dates_tba: true`) come first and ignore the months window. |
| `GET /gmp` | `gmp` | Free | `type` as above. `status` only `open` or `upcoming` (any other value is 422). | Current GMP for every open and upcoming issue from the last three months. This is the poll target. |
| `GET /ofs` | `ofs` | Pro | `limit` | Future. OFS list. Not an IPO Singh provider method. |
| `GET /unlisted` | `unlisted` | Pro | `search` matches name, display name, slug, or ISIN. | Future. Unlisted list. Not a provider method. |

`upcoming` on `GET /ipos` means an open date after today, plus pre-RHP mainboard issues with `dates_tba: true`.

### Per-IPO reads

There is no bulk subscription endpoint, no bulk GMP-history endpoint, and no bulk anchor endpoint.

| Method and path | Scope | Plan | Query | Use |
| --- | --- | --- | --- | --- |
| `GET /ipos/{slug}` | `details`; editorial blocks need `details_full` | Free for the core document, Basic for company, contacts, and documents | Path `slug` only | Timeline, issue terms, GMP, subscription summary, listing. Basic adds lot calculator, reservation, shares offered, company, contacts, documents. |
| `GET /ipos/{slug}/gmp` | `gmp` | Free | Path `slug` only | One current GMP. The reference says looping this exhausts quota and adds no data beyond `GET /gmp`. |
| `GET /ipos/{slug}/gmp/history` | `gmp_history`; `timeline` needs `gmp_intraday` | Standard for `trend`, Pro for `timeline` | Optional `days`. Trims to the most recent N days and cannot widen past the plan ceiling. | One issue's bidding window, typically two to four weeks and at most 31 days. No multi-year series. |
| `GET /ipos/{slug}/subscription` | `subscription` | Standard | Path `slug` only | Live category tree. Mainboard figures are the consolidated NSE number. |
| `GET /ipos/{slug}/subscription/history` | `subscription_history` | Pro | Path `slug` only | One snapshot per bidding day, near the close. Not intraday. |
| `GET /ipos/{slug}/anchors` | `anchors` | Standard | Path `slug` only | Anchor book. Empty arrays before allocation, which is one working day before open. |
| `GET /ofs/{slug}` | `ofs` | Pro | Path `slug` only | Future. Stored bid snapshot, including green shoe. Calling it does not hit NSE or BSE. |
| `GET /unlisted/{slug}` | `unlisted` | Pro | Optional `days` | Future. A listed company returns 404. |

Slug is the only identifier. v2 does not expose numeric ids. Names are not stable.

### Account

| Method and path | Plan | Notes |
| --- | --- | --- |
| `GET /me` | Free | No parameters. Returns client name, plan, `expires_at`, `lapsed`, `scopes`, `limits` (`per_minute`, `per_day`, `gmp_history_days`), and `usage_today` (`used`, `remaining`, `resets_at` as an IST label). Counts against quota. |
| Plan catalogue | Not printed | The account section says two endpoints. The second section is titled "Plan catalogue", has no parameters, and returns published prices, limits, `gmp_history_days`, and scopes. Its path is absent from the captured page. |

## OFS and unlisted, inspected only

These stay out of the provider interface and out of the website until a later prompt adds domain models.

OFS list fields printed on the page: `slug`, `company`, `short_name`, `category` (typically `Retail` or `Non-Retail`), `status` (example value `closed`), `open_date` and `close_date` as ISO timestamps, `floor_price`, `discount`, `nse_symbol`, `bse_scripcode`, `subscription`. Detail adds `seller`, share and green-shoe sizes, and a `book` object that is null when no snapshot is stored. The example book date is `01-Sep-2026`, which is not `YYYY-MM-DD`.

Unlisted: `price_type` is always `indicative_dealer_quote`. `price_source` is `unlistedzone` or `manual`. `is_stale` is true when there is no price or the quote is older than 7 days. Refresh hours printed on the page are 09:00, 15:00, and 21:00 IST. `ltp_updated_at` is the refresh time in UTC. `price_date` is the quote date. Valuation fields are strings and are often null. `price_history` is oldest first. `days` takes the most recent N readings and then sorts them oldest first. The 52-week band uses stored readings; pre-split readings stay in history and leave the band.

## Errors

Branch on the machine `error` code. The reference says messages may be reworded. 404 and 422 have no machine code in the published table.

| HTTP | Code | IPO Singh handling when a client exists |
| --- | --- | --- |
| 401 | `missing_key` | Configuration failure. Do not retry. Do not treat as an empty catalogue. |
| 403 | `invalid_key` | The key is unknown or deactivated. Do not retry. |
| 402 | `plan_upgrade_required` | The body includes `required_scope`, `your_plan`, `upgrade_to`, and `upgrade`. Also returned when a paid plan has lapsed. Do not retry. Do not substitute an empty array. Do not fall through to the mock provider. |
| 404 | none (`success: false` and `message`) | Unknown slug or unknown path. Do not retry. A missing IPO is not an empty GMP. |
| 422 | none; the body names the field | Invalid query. Do not retry the same query. `status` and `type` are the documented validation cases. |
| 429 | `rate_limited` | Burst limit. Wait `retry_after` seconds, and honour `Retry-After`. The short application backoff must not replace that wait. |
| 429 | `daily_quota_reached` | Body includes `plan`, `resets_at` (IST label), and `upgrade`. Stop until the printed reset. Retrying earlier spends nothing useful and the reference says it will not help. |
| 5xx | Not published | The error table does not define a 5xx body or code. Treat the response as an upstream outage. Surface the failure. Do not invent a vendor code and do not store an empty market reading. |
| Network failure or timeout | Not published | The vendor examples set a 10 second client timeout. IPO Singh's gateway default is 8 seconds. A timeout or a dropped connection is an outage, using the existing timeout and unavailable errors. The circuit breaker already opens after repeated failures. |

The reference also says to fail soft on a missing field: keep rendering the rest of the page. That applies to a null inside a successful document. It does not apply to 401, 402, 403, 429, 5xx, or a transport failure.

## Capabilities that stay unverified

| Provider feature | v2 source | Why it stays unverified |
| --- | --- | --- |
| `listIpos` | `GET /ipos` | Supported when the backend client is enabled. One unfiltered refresh uses `months=0`. |
| `ipoDetails` | `GET /ipos/{slug}` | Same. |
| `currentGmp` | `GET /gmp` | The worker polls the unfiltered collection. The per-IPO provider method stays unverified and is not called. |
| `gmpHistory` | `GET /ipos/{slug}/gmp/history` `trend` | The worker calls this once per due issue. The per-IPO provider method stays unverified. |
| `intradayGmp` | Same URL, `timeline` | Pro `timeline` on that same response. Below Pro the array is empty and `locked` names `timeline`. |
| `currentSubscription` | `GET /ipos/{slug}/subscription` | The worker calls this once per due issue. Open issues start at 60 minutes. The per-IPO provider method stays unverified. |
| `subscriptionHistory` | `GET /ipos/{slug}/subscription/history` | The worker calls this on the history interval. Pro scope. A Standard key receives 402 and then waits out the listed history interval. The per-IPO provider method stays unverified. |
| `companyFinancials` | Inside detail, `details_full` | The only printed metric name is `Assets`. Revenue, PAT, and EPS are not named. |
| `registrarDetails` | Inside detail `contacts.registrar` | The printed example has name, slug, `status_page`, and `supports_in_app`. Phone, email, and website are not printed. |
| `listingInformation` | List and detail `listing` | CMP and current gain have no domain fields. Listing price does. |

No provider feature exists for the anchor book, OFS, unlisted shares, kostak, subject-to-sauda, or allotment status. Subscription subcategories, including bNII and sNII, are stored on the subscription category when the vendor sends them.
