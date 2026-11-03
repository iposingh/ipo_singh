# Allotment automation — final workflow

IPO Singh detects when official registrar allotment-status company lists include an IPO, then marks **Allotment Out**, updates caches, and (when enabled) queues Expo push notifications to every eligible device.

Investor PAN / application / demat lookups are never automated or stored.

## Supported registrars

| Registrar | Official portal | Automated signal | Method |
|---|---|---|---|
| KFin Technologies | https://ipostatus.kfintech.com/ | Company objects in the public `main.*.js` bundle (`JSON.parse([{clientId,name},…])`) | `kfin-js-bundle-company-list` |
| MUFG Intime | https://in.mpms.mufg.com/Initial_Offer/public-issues.html | `POST …/IPO.aspx/GetDetails` → `{ d: "<NewDataSet>…</NewDataSet>" }` | `mufg-getdetails-xml` |
| Bigshare Services | https://ipo.bigshareonline.com/ipo_status.html | Public HTML `select#ddlCompany` options (comments ignored) | `bigshare-html-company-select` |

TLS uses the platform CA trust store. Certificate validation is never disabled.

Registrar HTTP clients use a browser-compatible User-Agent plus `X-IPO-Singh-Purpose: allotment-company-list-readonly`. Some registrar CDNs return an SPA HTML shell to unknown agents; this does not disable CAPTCHA, authentication, or certificate checks.

**Authorization:** Successful read-only retrieval is not the same as permission for continuous automated monitoring. Confirm each registrar’s usage terms (or obtain written authorization) before enabling production polling. Until then, treat registrars as **requires authorization**.

## Schedule (Asia/Kolkata)

1. Eligible IPOs: closed / allotment awaited, not listed, not already confirmed, registrar supported.
2. Monitoring starts at **21:00 IST** on the expected allotment date (or day after close when allotment date is missing).
3. Poll interval: **15 minutes** until confirmed or `monitorDays` (default 14) elapses.
4. Each pass fetches each registrar list **once**, then matches all due IPOs for that registrar.
5. Redis distributed lock: `allotment-verify-pass` (falls back to process-local lock when Redis is unset).

## Confirmation rules

- Unique normalized name match, verified alias, or previously stored registrar company ID.
- Ambiguous matches → inconclusive (manual review).
- Network / parse errors leave prior verified status unchanged and never invent “not published”.
- Confirmed allotments never regress when a company later leaves the dropdown.
- Listed IPOs are never moved backwards into allotment.

## Notifications

When confirmation is stored and `ALLOTMENT_BROADCAST_ENABLED=true`:

- Queue one in-app + push-pending notification per eligible owner who has an active Expo token, allotment category enabled, alerts on, and mobile push not off.
- **Anonymous installations** (guest browsing) may register via `POST /api/v1/notifications/device-push-tokens` with a privacy-conscious installation UUID. They receive allotment-out broadcasts only when `allotmentAlertsEnabled` is true. No PAN or application numbers are collected.
- Watchlist membership is **not** required.
- Dedupe key: `ipo-allotment-confirmed:<ipoId>` (per owner).
- Multiple devices for one owner count toward `eligibleDevices` but create **one** notification event.
- Expo delivery reuses the existing push worker; acceptance ≠ device delivery.
- Production broadcasts stay off until explicitly authorized (`ALLOTMENT_BROADCAST_ENABLED`).

## Required environment variables

```bash
# Database / cache (worker + API)
MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-dev   # must contain dev|test outside production
REDIS_URL=redis://127.0.0.1:6379                      # optional; omit for single-instance local locks

# Allotment worker switches (default off)
ALLOTMENT_VERIFY_ENABLED=false          # recurring polling inside the sync/allotment worker
ALLOTMENT_VERIFY_MODE=once              # one-shot verification pass then exit
ALLOTMENT_BROADCAST_ENABLED=false       # global eligible-device notification queue

# Expo (optional until physical-device delivery is authorized)
EXPO_PUSH_ACCESS_TOKEN=
EXPO_PUBLIC_EAS_PROJECT_ID=             # mobile app.config extra.eas.projectId
```

## MongoDB and Redis prerequisites

- MongoDB reachable; non-production database names must include `dev` or `test`.
- Redis recommended for multi-instance lock coordination. Without Redis the worker still runs with an in-process lock (not safe across multiple hosts).
- Indexes are ensured on API/worker connect (`ensureIndexes`).

## Worker startup commands

```bash
# From repo root after build, or via workspace scripts:
cd apps/api

# One-shot verification (no broadcast unless ALLOTMENT_BROADCAST_ENABLED=true)
ALLOTMENT_VERIFY_MODE=once ALLOTMENT_VERIFY_ENABLED=true \
  ALLOTMENT_BROADCAST_ENABLED=false \
  npm run start:worker -w @ipo-singh/api

# Source one-shot without build (development)
ALLOTMENT_VERIFY_MODE=once ALLOTMENT_VERIFY_ENABLED=true \
  ALLOTMENT_BROADCAST_ENABLED=false \
  node --experimental-strip-types src/worker.ts

# Recurring allotment polling (provider optional when only allotment is enabled)
ALLOTMENT_VERIFY_ENABLED=true ALLOTMENT_BROADCAST_ENABLED=false \
  npm run start:worker -w @ipo-singh/api
```

`ALLOTMENT_VERIFY_MODE=once` allows an allotment-only pass even when IPO Guru is not configured. Production polling and broadcasts remain separately configurable.

## Deployment process

1. Deploy API + worker images/binaries with allotment flags **false**.
2. Confirm MongoDB and Redis connectivity from the worker host.
3. Run the safe staging procedure below against an isolated `*test*` / `*dev*` database.
4. Run the live registrar probe (read-only).
5. Enable `ALLOTMENT_VERIFY_ENABLED=true` only after registrar authorization and staging sign-off.
6. Enable `ALLOTMENT_BROADCAST_ENABLED=true` only after physical-device Expo verification and explicit authorization.

## Safe staging test procedure

1. Use an isolated URI, for example `mongodb://127.0.0.1:27017/ipo-singh-allotment-verify-test`.
2. Leave `ALLOTMENT_BROADCAST_ENABLED` unset/false and `EXPO_PUSH_ACCESS_TOKEN` unset.
3. Run the deterministic lifecycle harness (mocked registrar responses):

```bash
cd apps/api
MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-allotment-verify-test \
  REDIS_URL= \
  ALLOTMENT_BROADCAST_ENABLED=false \
  node --experimental-strip-types src/jobs/allotment/staging-verify.ts
```

4. Expect: no poll before 21:00 IST; unconfirmed while absent; confirmed + evidence when present; no duplicate confirmation on repeat.
5. Optional one-shot worker against the same DB (live registrar reads, no broadcast):

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-allotment-verify-test \
  REDIS_URL= \
  ALLOTMENT_VERIFY_MODE=once \
  ALLOTMENT_VERIFY_ENABLED=true \
  ALLOTMENT_BROADCAST_ENABLED=false \
  node --experimental-strip-types src/worker.ts
```

6. Review `/admin/allotment` evidence on that database. Do not point staging at production data.

## Physical-device push testing procedure

Physical delivery is **pending** until an EAS project id and a real device build exist.

1. Run `eas init` (or set `EXPO_PUBLIC_EAS_PROJECT_ID`) so `app.config` exposes `extra.eas.projectId`.
2. Create a development build (`eas build --profile development`) and install on a physical phone (Expo Go is insufficient for these remote reminders).
3. Grant notification permission from the in-app explanation flow (signed-in reminders or guest allotment reminders).
4. Confirm Android channel `ipo-reminders` appears in system settings.
5. Register the Expo push token (authenticated `/push-tokens` or anonymous `/device-push-tokens`).
6. On a **non-production** API with `ALLOTMENT_BROADCAST_ENABLED=true` and a test Expo access token, confirm one allotment notice, then tap it and verify the IPO detail route opens (`slug` / `ipoId` in notification data).
7. Do not send to production user tokens until authorized.

## Production activation checklist

1. Confirm Node runtime trusts public CAs (no TLS bypass).
2. Confirm registrar authorization for automated monitoring (or keep polling disabled).
3. Verify read-only live retrieval: `node --experimental-strip-types src/jobs/allotment/live-registrar-probe.ts`.
4. Run allotment unit + e2e tests and typecheck/lint.
5. Deploy API + worker with `ALLOTMENT_VERIFY_ENABLED=false` and `ALLOTMENT_BROADCAST_ENABLED=false`.
6. Staging lifecycle + one-shot dry run on an isolated database.
7. Enable recurring verification: `ALLOTMENT_VERIFY_ENABLED=true`.
8. Only after explicit authorization + physical-device proof: set `ALLOTMENT_BROADCAST_ENABLED=true` and configure `EXPO_PUSH_ACCESS_TOKEN`.
9. Monitor worker logs, Redis lock health, admin notification counters, and verification evidence.

## Rollback procedure

1. Set `ALLOTMENT_VERIFY_ENABLED=false` and `ALLOTMENT_BROADCAST_ENABLED=false` on the worker and redeploy/restart.
2. Leave already-confirmed IPO allotment flags in place (do not mass-revert).
3. If a bad confirmation occurred, use admin tools to correct evidence/notes; do not wipe production databases from staging scripts.
4. Revoke `EXPO_PUSH_ACCESS_TOKEN` if erroneous pushes were queued.

## Monitoring and troubleshooting

| Symptom | Check |
|---|---|
| Worker exits immediately | Provider not configured and allotment flags off; or Mongo missing |
| `checked: 0` after 9 PM IST | IPO not due (dates/status), registrar unsupported, or lock held |
| Redis connection errors | `REDIS_URL` host; worker continues with local lock only when Redis unset |
| `notificationDispatch: skipped` | `ALLOTMENT_BROADCAST_ENABLED` false or no eligible tokens |
| Duplicate notices | Dedupe key `ipo-allotment-confirmed:<ipoId>` should block per owner |
| Registrar parse errors | Live probe; CDN/HTML change; never disable TLS |
| Push not on device | Missing EAS project id, simulator/Expo Go, or Expo token invalid |

Admin UI: `/admin/allotment` shows monitoring start, last check, matched company ID, evidence, notification dispatch, and eligible device counts. Operators can retry a supported check or confirm manually with a verified registrar URL + evidence note.

## Tests

```bash
npm run test -w @ipo-singh/core -- --test-name-pattern='normalize|requires|prefers|registrar'
cd apps/api && node --experimental-strip-types --test --test-reporter spec \
  src/jobs/allotment/*.test.ts src/jobs/allotment-verify.test.ts
npm run typecheck -w @ipo-singh/api -w @ipo-singh/core -w @ipo-singh/contracts -w @ipo-singh/web
```

## Admin

`/admin/allotment` shows monitoring start, last check, matched company ID, evidence, notification dispatch, and eligible device counts. Operators can retry a supported check or confirm manually with a verified registrar URL + evidence note.
