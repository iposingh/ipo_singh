# Sync operations (Cron + local worker)

## Why observations can look a day old

IPO Singh does not refresh GMP or subscription on every website page view. Updates require:

1. A successful Cron pass (or a local worker / manual one-shot), and
2. Successful provider calls within quota, and
3. Successful Mongo writes, and
4. Cache invalidation after writes.

If Cron is stopped, yesterday’s stored observations remain visible. That is not the same as marking a reading Delayed: Delayed means the **observation timestamp** is strictly older than 24 hours.

## Production: Render Cron Job

Production synchronization runs as a **one-shot** process every five minutes:

```bash
npm run start:cron -w @ipo-singh/api
```

Schedule on Render: `*/5 * * * *` (UTC). Eligibility uses **Asia/Kolkata** windows inside `apps/api/src/cron.ts`. Full Render settings: `docs/render-cron.md`.

Do not rely on website visits. Do not expose a public HTTP sync trigger.

## Safe local commands

From the repo root (loads `apps/api/.env` via the entrypoint):

```bash
# Production-shaped one-shot (same entry as Render Cron)
npm run start:cron -w @ipo-singh/api
# or during development without a prior build:
npm run dev:cron -w @ipo-singh/api

# One-shot enrichment / catch-up (refuses without SYNC_TOKEN; refused in production)
npm run sync:once -w @ipo-singh/api

# Optional continuous local worker (not the production path)
npm run start:worker -w @ipo-singh/api
npm run dev:worker -w @ipo-singh/api
```

Defaults (application polling, not provider guarantees):

- Cron catalogue window: 09:00–18:00 IST every 30 minutes
- GMP collection: still 60–120 minutes via `SYNC_GMP_COLLECTION_MS` (default 90), only inside 09:00–17:00 IST
- Subscription while open: ~10 minutes inside 10:00–17:00 IST on Cron (override with `CRON_SUBSCRIPTION_INTERVAL_MS`)
- Detail: ~2 hours inside 09:00–18:00 IST
- Allotment verification: 21:00–01:00 IST every 15 minutes (+ morning follow-up); kill switch default off
- Tick budget: `CRON_MAX_CALLS_PER_PASS` / `SYNC_MAX_CALLS_PER_TICK` (default 8)

Listed catalogue rows are **not** polled for current subscription, subscription history, GMP history, or full detail in the bounded pass. That keeps quota for current, upcoming, and recently closed issues instead of a historical backfill.

Never exceed the provider plan. Internal guards remain 30/minute and 1,000/day unless env overrides them within safe bounds.

Ops health: `/api/v1/ops/status` (requires `OPS_TOKEN`) reports `sync.lastSuccessAt`, success/failure counts, and quota usage. The API process does not start Cron or the worker.

## Hosting when the laptop is off

Deploy the API as a web service and **one Render Cron Job** for `start:cron` on the same MongoDB Atlas database and Redis namespace. Website traffic alone will not keep data fresh. Do not use `ipo-singh-dev` for production Cron.

## Allotment verification

`apps/api/src/jobs/allotment-verify.ts` records unconfirmed/unsupported results until a permitted structured source exists. Keep `ALLOTMENT_VERIFY_ENABLED=false` until tested. CAPTCHA-protected pages are out of scope. Administrator confirmation requires an audit evidence note.
