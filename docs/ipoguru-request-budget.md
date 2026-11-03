# IPO Guru v2 request budget

Audit date: 19 October 2026. No live key was used. Counts below are arithmetic on the published plan limits and on IPO Singh's default sync intervals. They are not a census of the live catalogue.

Related docs: `docs/ipoguru-v2-integration.md`, `docs/sync.md`.

## Two different ceilings

| Ceiling | Per minute | Per day | Source |
| --- | --- | --- | --- |
| IPO Guru Free | 1 | 10 | Vendor page. Non-commercial evaluation. |
| IPO Guru Basic | 10 | 250 | Vendor page. |
| IPO Guru Standard | 20 | 1,000 | Vendor page. |
| IPO Guru Pro | 40 | 3,000 | Vendor page. |
| IPO Singh application default | 30 | 1,000, of which 50 are reserved | `PROVIDER_REQUESTS_PER_MINUTE`, `PROVIDER_REQUESTS_PER_DAY`, `PROVIDER_RESERVED_REQUESTS`. The code comment states these are application ceilings, not a vendor contract. |

The application minute ceiling (30) is above Standard (20) and below Pro (40). A worker that trusts the application ceiling can receive a vendor 429 on Standard while the local gate still says the minute is open. Before a live key is used, set the application minute and day ceilings to the purchased plan, and keep the reserved pool inside that day ceiling.

`GET /me` counts as one vendor request. Use it for an occasional ops check, not on the sync hot path.

`PROVIDER_MAX_RETRIES` defaults to 2, so one failing logical call can become three HTTP requests. The budgets below count successful logical calls. 402, 401, 403, 404, and 422 must not be retried. A burst 429 waits for `retry_after` / `Retry-After`. A daily 429 stops the worker until the printed IST reset. 5xx and network failures follow the existing circuit breaker (5 failures, then 30 seconds open) and still count as vendor requests when the TCP call was sent.

The gateway timeout is 8 seconds. Vendor examples use 10 seconds.

## What one logical sync call becomes

The planner prices history at 2 calls and every other category at 1 (`callsFor` in `apps/api/src/jobs/schedule.ts`). A tick allows 8 calls (`SYNC_MAX_CALLS_PER_TICK`) and runs every 60 seconds.

| Planner category | HTTP shape required by v2 | Calls |
| --- | --- | --- |
| `catalog` list | `GET /ipos` once per refresh. `months=0` is the full book. The default `months=3` drops older issues. | 1 per tick that refreshes the list, not 1 per IPO |
| `catalog` detail | `GET /ipos/{slug}` for issue terms, and Basic `details_full` for company, registrar, and documents | 1 per IPO |
| `gmp` for open and upcoming | `GET /gmp` once for the whole live set. Per-slug GMP is a detail-page read. | 1 per poll, not 1 per IPO |
| `gmp` for listed or closed | `GET /gmp` does not include them. `status` other than `open` or `upcoming` is 422. | 1 × `GET /ipos/{slug}/gmp` per IPO that still needs a current reading |
| `subscription` | No bulk URL. Current and history are separate calls. | 1 × `GET /ipos/{slug}/subscription` per due issue. History is 1 × `GET /ipos/{slug}/subscription/history` on the slower history interval. A 402 waits out the listed history interval. |
| `financial` | Same document as detail | 0 extra HTTP calls when that slug was fetched in the same catalog pass |
| `history` | `GET /ipos/{slug}/gmp/history` for GMP. Subscription history uses its own URL and is not added to that call. | 1 GMP history per due issue. A completed closed, allotment, or listed window is not fetched again. |
| Anchors | Not in the planner | 1 × `GET /ipos/{slug}/anchors` when an anchor book is first stored. Empty before allocation. Not a 15-minute poll. |

`SYNC_MAX_CALLS_PER_TICK` of 8 fits Basic's 10/minute and Standard's 20/minute for a single tick. It does not fit Free's 1/minute. Two ticks cannot share a clock minute without exceeding Basic.

## Default intervals, converted to calls per issue per day

| Phase | GMP | Subscription | Financial | History ticks |
| --- | --- | --- | --- | --- |
| Open | every 30 minutes → 48 | every 60 minutes → 24 | every 24 hours → 1 | every 6 hours → 4 |
| Upcoming | every 6 hours → 4 | every 6 hours → 4 | every 7 days → 1/7 | every 24 hours → 1 |
| Listed | every 24 hours → 1 | every 24 hours → 1 | every 7 days → 1/7 | every 7 days → 1/7 |
| Other (closed, allotment, unknown) | every 2 hours → 12 | every 24 hours → 1 | every 7 days → 1/7 | every 24 hours → 1 |

The vendor's own caching note says GMP moves a handful of times a day and a 5–15 minute cache is enough for subscription, because subscription follows exchange releases. A 15-minute poll is about 96 calls a day per open issue. Ten open issues at that rate are about 960 subscription reads before catalogue, GMP, or history, which does not fit a 1,000/day Standard budget. The configured start is 60 minutes during active bidding (24 calls a day per open issue). Upcoming stays at 6 hours. Listed, closed, and allotment stay at 24 hours. This is an application quota choice. It is not a claim that the exchange updates every hour. The open GMP interval (30 minutes) is coarser than 5–15 minutes and matches "a handful of times a day" if the poll is the bulk `GET /gmp`.

## Naive cost if each planner call is its own HTTP request

Let `O` be open issues, `U` upcoming, `L` listed, `X` other, and `N = O + U + L + X` the catalogue being refreshed.

Daily logical calls:

- Catalog: `1 + N`
- GMP: `48O + 4U + L + 12X`
- Subscription: `96O + 4U + L + 12X`
- Financial: `O + (U + L + X) / 7`
- History: `2 × (4O + U + X + L / 7)`

The subscription line `96O` is the rejected 15-minute rate. The configured open rate is 24 reads a day per open issue. Closed and listed subscription is one read a day.

Illustration, not a live count: `O = 5`, `U = 8`, `L = 10`, `X = 6`, so `N = 29`.

| Bucket | Calls / day |
| --- | ---: |
| Catalog | 30 |
| GMP | 354 |
| Subscription | 594 |
| Financial | 8.4 |
| History | 70.9 |
| Total | 1,057.3 |

That illustration is above Standard's 1,000/day and above the application day ceiling once retries or `GET /me` are added. It is above Free (10) and Basic (250). It fits inside Pro (3,000). Most of the GMP and other-phase lines are wasted against v2, because open and upcoming GMP are one bulk call and closed issues do not need 12 current-GMP reads a day.

On Standard, half of the history line is `subscription/history` and returns 402. In the illustration that is about 35 failed requests a day that still consume quota.

## Implemented current-GMP poll

The worker calls unfiltered `GET /gmp` once per collection interval. The default is 90 minutes (`SYNC_GMP_COLLECTION_MS`), and the allowed range is 60–120 minutes. A tight day budget uses 120 minutes. A stale or missing premium for an open or upcoming issue uses 60 minutes while budget remains. That is 16 calls per day at the default, not 48, and it is not a 15-minute poll. Per-slug `GET /ipos/{slug}/gmp` is not called.

## Vendor-shaped daily budget

The table below is the earlier audit arithmetic. The live GMP line is the 90-minute collection poll above, not `GET /gmp` every 30 minutes.

| Request | Standard | Pro |
| --- | ---: | ---: |
| `GET /ipos?months=0` once | 1 | 1 |
| `GET /gmp` every 30 minutes, unfiltered | 48 | 48 |
| Current GMP for listed issues, once each | `L` | `L` |
| Current GMP for other issues, once each (the 2-hour interval is dropped in this budget) | `X` | `X` |
| Subscription, open | `96O` | `96O` |
| Subscription, upcoming | `4U` | `4U` |
| Subscription, listed and other, once each | `L + X` | `L + X` |
| Detail document, once per IPO | `N` | `N` |
| GMP history, open, 4 times | `4O` | `4O` |
| GMP history, upcoming and other, once | `U + X` | `U + X` |
| GMP history, listed, weekly | `L / 7` | `L / 7` |
| Subscription history | 0 (scope is Pro; calling it is a 402) | `4O + U + X + L / 7` |
| `GET /me` once | 1 | 1 |

Same illustration (`O = 5`, `U = 8`, `L = 10`, `X = 6`, `N = 29`):

| Plan | Calls / day |
| --- | ---: |
| Standard, vendor-shaped | 658.4 |
| Pro, vendor-shaped, adding subscription history | 693.8 |

Both sit under Standard's 1,000 and Pro's 3,000, and under the application day ceiling of 1,000 with the 50-request reserve left intact (658.4 ≤ 950). Free and Basic cannot run this illustration: Free stops at 10/day, Basic at 250/day.

The illustration above used a 15-minute open subscription interval (96 reads a day per open issue). That rate is not the configured schedule. At the 60-minute start, each additional open issue costs 24 current subscription reads a day, plus about 4 subscription-history reads while the issue is bidding. Ten open issues are about 240 current reads a day before catalogue, GMP, and history. The 15-minute rate remains the reason the start interval is 60 minutes: twenty open issues at 15 minutes are 1,920 subscription reads, which exceeds Standard even with no other traffic.

Anchors, OFS, and unlisted are outside the table. One anchor fetch per newly allocated issue is a small Standard-scope add. OFS and unlisted are Pro-only and have no sync category.

## Minute budget for the illustration

A vendor-shaped open tick is 1 bulk GMP call plus one subscription call per due open issue, capped at 8 calls by the planner.

| Open issues due in one tick | Calls in that minute | Fits |
| --- | ---: | --- |
| 5, plus bulk GMP | 6 | Basic, Standard, Pro. Exceeds Free. |
| 8-call cap | 8 | Basic (10), Standard (20), Pro (40). Exceeds Free. |
| Planner left at 8, application ceiling left at 30 | Up to 30 if the cap is raised | Exceeds Standard's 20. Fits Pro's 40. |

Do not raise `SYNC_MAX_CALLS_PER_TICK` above the purchased per-minute limit.
