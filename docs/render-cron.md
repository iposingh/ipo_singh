# Render Cron Job — IPO Singh synchronization (Prompt 86)

**Date:** 4 November 2026 (Asia/Kolkata)\
**Purpose:** Replace the continuously running production worker with one Render Cron Job.\
**Does not:** deploy automatically, create paid resources, enable push delivery, or flip allotment verification.

Companion docs: `sync-worker-ops.md`, `ipo-data-sync-production.md`, `production-deployment-readiness.md`, `notifications-production.md`.

---

## Render service settings

| Field | Value |
| --- | --- |
| Service type | Cron Job |
| Repository | `iposingh/ipo_singh` |
| Branch | `main` |
| Runtime | Node |
| Node version | `24` |
| Region | Singapore |
| Root directory | Repository root (monorepo) |
| Schedule | `*/5 * * * *` (UTC) |

### Build Command

```bash
npm ci && npm run build -w @ipo-singh/contracts && npm run build -w @ipo-singh/core && npm run build -w @ipo-singh/api
```

If the Render service already installs workspaces at the root, an equivalent is:

```bash
npm ci && npm run build -w @ipo-singh/api
```

(ensure `@ipo-singh/contracts` and `@ipo-singh/core` build first when not using the root `npm run build` workspace cascade).

### Command (start)

```bash
npm run start:cron -w @ipo-singh/api
```

This runs `node apps/api/dist/cron.js` (bundled from `apps/api/src/cron.ts`).

The API web service continues to use:

```bash
npm run start:api
```

Do **not** point the Cron Job at `start:worker`. Do **not** expose an HTTP route that triggers synchronization.

---

## Schedule model

Render fires every five minutes in **UTC**. The process independently evaluates **Asia/Kolkata** windows. The host timezone is never used for eligibility.

| Task | IST window | Interval | Notes |
| --- | --- | --- | --- |
| Catalogue | 09:00–18:00 | 30 minutes | Existing sync metadata / locks |
| GMP collection | 09:00–17:00 | 30 minutes desired | Engine still respects `SYNC_GMP_COLLECTION_MS` (60–120 minutes) |
| Active subscriptions | 10:00–17:00 | 10 minutes | Open-issue cadence via cron policy |
| IPO details | 09:00–18:00 | 2 hours | Financial/detail loader |
| Historical data | 09:00–18:00 | Existing history TTLs | No full-catalogue backfill |
| Allotment verification | 21:00–01:00 (+ morning 08:00–10:00) | 15 minutes | Kill switch default off |
| Alerts + push receipts | Every cron wake | Bounded pass | Push send still gated |

Allotment overnight wrap: 21:00–23:59 and 00:00–01:00 IST inclusive (final overnight check at 01:00). Pending results retry in the morning follow-up window. Per-IPO eligibility still uses expected allotment date so midnight does not drop the previous calendar day’s IPO.

---

## Required environment variable names

Use the **same production MongoDB and Redis** as the API. Do not point the Cron Job at `ipo-singh-dev`.

Placeholders only — never paste secret values into docs or git:

| Name | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `IPO_SINGH_DEPLOYMENT` | Yes | `production` (or `staging` on a staging cron) |
| `MONGODB_URI` | Yes | Production DB name (not `dev` / `test` / `staging`) |
| `REDIS_URL` | Yes | Distributed locks + quota |
| `IPO_DATA_PROVIDER` | For sync | `ipo-guru` when live sync is intended |
| `IPOGURU_ENABLED` | For sync | `true` only when credentials and budgets are ready |
| `IPOGURU_API_KEY` | For sync | Server-only; never `NEXT_PUBLIC_` / `EXPO_PUBLIC_` |
| `IPOGURU_BASE_URL` | Optional | Default `https://www.ipoguru.in/api/v2` |
| `IPOGURU_MINUTE_BUDGET` / `IPOGURU_DAILY_BUDGET` | Recommended | Match purchased plan; keep internal caps ≤ plan |
| `PROVIDER_REQUESTS_PER_MINUTE` / `PROVIDER_REQUESTS_PER_DAY` | Recommended | Defaults 30 / 1000 |
| `ALLOTMENT_VERIFY_ENABLED` | Optional | Default unset/`false` |
| `PUSH_DELIVERY_ENABLED` | Optional | Default unset/`false` |
| `ALLOTMENT_BROADCAST_ENABLED` | Optional | Default unset/`false` |
| `EXPO_PUSH_ACCESS_TOKEN` | Optional | Only when push delivery is authorized |
| `LOG_LEVEL` | Optional | `info` |
| `SERVICE_NAME` | Optional | Appears as `{name}-cron` in logs |
| Mongo pool / Redis timeout vars | Optional | Same as API |
| `SYNC_*` / `CRON_*` / `ALERT_*` / `CACHE_*` | Optional | See `apps/api/.env.example` |

CORS, `HOST`, and `PORT` are not required for the Cron Job (no HTTP server).

---

## Kill switches (remain off until explicit approval)

- `ALLOTMENT_VERIFY_ENABLED=false`
- `PUSH_DELIVERY_ENABLED=false`
- `ALLOTMENT_BROADCAST_ENABLED=false`

---

## Reliability

- Whole-pass Redis lock `cron-pass` prevents overlapping Render retries.
- Per-resource sync locks and sync-run metadata keep work idempotent.
- One noncritical task failure is logged; other tasks still run in the same pass.
- Unrecoverable setup failures (missing Mongo/Redis in production) exit nonzero after cleanup.

---

## Manual deployment steps (operator)

1. Merge the cron changes to `main`.
2. Create the Render Cron Job with the settings above (Singapore, Node 24).
3. Copy production env names from the API service (same Mongo + Redis).
4. Confirm kill switches stay false.
5. Deploy the Cron Job; watch one daytime and one overnight log cycle.
6. Keep or remove any legacy always-on worker service after cron is healthy.
7. Do not enable allotment verification or Expo push until separately approved.
