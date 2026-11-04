# IPO Singh synchronization

The public API reads MongoDB and Redis. It does not call a market-data provider when someone opens the website or a mobile app.

Synchronization runs outside the API process. Importing the API, starting `npm run dev`, or opening a page does not start sync.

## Production

Run the API web service plus one Render Cron Job (`docs/render-cron.md`):

```bash
npm run build
npm run start:api
npm run start:cron
```

`npm run start:cron` runs `node apps/api/dist/cron.js`. Give Cron the same `MONGODB_URI`, `REDIS_URL`, and provider variables as the API. Do not put those secrets in the repository. Schedule: `*/5 * * * *` UTC; IST windows are evaluated inside the process.

Set `REDIS_URL`. Cron uses Redis for a whole-pass lock, per-resource sync locks, and the shared per-minute and per-day provider quota. Overlapping Cron retries skip when the pass lock is held.

`IPO_DATA_PROVIDER=ipo-guru` leaves Cron idle until `IPOGURU_ENABLED=true`. With both set, each due catalogue pass makes one `GET /ipos?months=0` and upserts those issues. Each due GMP pass makes one `GET /gmp` for open and upcoming issues and matches rows by slug. It does not call `GET /ipos/{slug}/gmp`. GMP history is one `GET /ipos/{slug}/gmp/history` per due issue, capped by the pass budget. A closed, allotment, or listed issue is not fetched again after a successful GMP history response. Current subscription is one `GET /ipos/{slug}/subscription` per due issue. Subscription history is a separate `GET /ipos/{slug}/subscription/history` and is not paired with GMP history. List pages do not request either history. The issue document is one `GET /ipos/{slug}` per due issue, on the financial interval, after those polls and inside the same budget. A Free response that omits the company block keeps the last stored narrative. A failed detail read does not clear it. `IPOGURU_ENABLED=true` by itself still allows the protected account probe. Production also rejects `IPO_DATA_PROVIDER=mock`.

Each Cron invocation exits after one bounded pass and closes MongoDB and Redis. The optional local `start:worker` continuous process remains for development only.

The API readiness check stays `jobs: not_configured`. That value means this API process is not the Cron or worker.

## Schedules

Schedules are application choices in `apps/api/.env.example`. They are not a vendor's update frequency. The IPO Guru current-GMP poll defaults to 90 minutes and can be set from 60 to 120 minutes with `SYNC_GMP_COLLECTION_MS`. A tight day budget uses 120 minutes. A stale or missing premium for an open or upcoming issue uses 60 minutes while budget remains. This does not mean IPO Guru updates every 15 minutes.

| Category | What it stores | Open | Upcoming | After listing |
| --- | --- | --- | --- | --- |
| Catalog | Company, issue, dates, registrar, documents | 24 hours | 24 hours | 24 hours |
| GMP | Current GMP observation | 30 minutes | 6 hours | 24 hours |
| Subscription | Current subscription observation | 60 minutes | 6 hours | 24 hours |
| Financials | One `GET /ipos/{slug}` document, including source statements | 24 hours | 7 days | 7 days |
| History | GMP history, and subscription history on its own URL | 6 hours | 24 hours | 7 days |

Closed and allotment issues use the "other" interval, which is at least as long as the open interval. Subscription's other interval is 24 hours, the same as after listing. Each tick makes at most `SYNC_MAX_CALLS_PER_TICK` provider calls (default 8). Current subscription for open issues is planned before GMP history, before subscription history, and before the issue document, so an active book is not crowded out by slower reads. A Standard key that receives `402 plan_upgrade_required` on subscription history waits out the listed history interval instead of retrying every tick. A closed, allotment, or listed subscription history is not fetched again after one success.

A failed fetch is retried inside the quota policy (`PROVIDER_MAX_RETRIES` and exponential backoff). Those retries still consume the minute and day quotas. If the fetch still fails, the stored rows are left as they are and the public cache is left as it is. The next attempt waits for that category's interval.

Successful writes are idempotent. After they commit, the worker deletes the matching provider and public Redis entries so the next read loads the stored rows.

Each attempt is stored in `sync_runs` with a resource name, start time, finish time, status, fetched count, and error name. Duration is the difference between the finish and start times. The error name is recorded. The provider payload is not.

## Development

A one-shot sync is available when `NODE_ENV` is not `production` and `SYNC_TOKEN` is 16 to 128 characters (`A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `-`). Do not commit the token. The worker does not write it to the log. Production exits before a one-shot sync even if a token is present.

```bash
SYNC_TOKEN=development-token-1 IPO_DATA_PROVIDER=mock MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-dev npm run sync:once
```

`mock` stores the synthetic Fixture Polymers issue. It does not call IPO Guru. There is no public HTTP route that starts a sync.

The database name must include `dev` or `test` outside production.
