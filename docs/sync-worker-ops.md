# Sync worker operations

## Why observations can look a day old

IPO Singh does not refresh GMP or subscription on every website page view. Updates require:

1. A running sync worker (or a manual one-shot), and
2. Successful provider calls within quota, and
3. Successful Mongo writes, and
4. Cache invalidation after writes.

If the worker is stopped, yesterday’s stored observations remain visible. That is not the same as marking a reading Delayed: Delayed means the **observation timestamp** is strictly older than 24 hours.

## Safe commands

From the repo root (loads `apps/api/.env` via the worker entrypoint):

```bash
# One-shot enrichment / catch-up (refuses without SYNC_TOKEN outside development)
npm run sync:once -w @ipo-singh/api

# Recurring worker (separate process; does not start with the API)
npm run start:worker -w @ipo-singh/api

# Development watch mode for the worker
npm run dev:worker -w @ipo-singh/api
```

Defaults (application polling, not provider guarantees):

- GMP collection: 60–120 minutes (`SYNC_GMP_COLLECTION_MS`, default 90 minutes)
- Subscription while open: ~60 minutes
- Catalog: daily
- Full issue detail (`details_full`): daily for open issues; slower for closed/allotment
- Tick: 60 seconds with `SYNC_MAX_CALLS_PER_TICK` (default 8)

Listed catalogue rows are **not** polled for current subscription, subscription history, GMP history, or full detail in the bounded worker. That keeps quota for current, upcoming, and recently closed issues instead of a 352-IPO historical backfill.

Never exceed the provider plan. Internal guards remain 30/minute and 1,000/day unless env overrides them within safe bounds.

Worker health: `/api/v1/ops/status` (requires `OPS_TOKEN`) reports `sync.lastSuccessAt`, success/failure counts, and quota usage. The API process does not start the worker.

## Hosting when the laptop is off

Deploy the API and a **second long-running process** for `start:worker` on the same MongoDB Atlas database and Redis Cloud namespace (for example Railway, Fly.io, Render, or a small VPS). Website traffic alone will not keep data fresh.

## Allotment verification worker

`apps/api/src/jobs/allotment-verify.ts` records unconfirmed/unsupported results until a permitted structured source exists. Do not start a scraping worker. Administrator confirmation requires an audit evidence note.
