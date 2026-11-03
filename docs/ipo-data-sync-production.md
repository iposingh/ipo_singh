# IPO Guru sync, data quality, and worker reliability

**Prompt:** 73\
**Date:** 3 November 2026 (Asia/Kolkata)\
**Rule:** Public website and mobile clients read **stored** IPO Singh API data only. They never call IPO Guru. Only the **worker** (and rare admin/ops paths) may spend vendor quota.

Related: `docs/sync.md`, `docs/ipoguru-v2-integration.md`, `docs/ipoguru-request-budget.md`, `docs/database-redis-production.md`.

---

## 1. Live account check (read-only)

Performed once via authorized `GET /me` against the configured local worker credentials. **API keys were not printed.**

| Field | Observed (3 Nov 2026) |
| --- | --- |
| Plan | `pro` |
| Limits | **40**/minute · **3000**/day |
| Plan expiry | `2026-11-28` |
| Scopes | `calendar`, `details`, `details_full`, `gmp`, `gmp_history`, `gmp_intraday`, `subscription`, `subscription_history`, `anchors`, `ofs`, `unlisted` |
| Vendor remaining (after probe) | day remaining **2999** (1 request used for `/me`) |

**Do not assume these numbers stay current.** Re-check from Admin → Provider (super-admin) or `IPOGURU_CONNECTIVITY_TEST=1` before changing schedules. Set `IPOGURU_MINUTE_BUDGET` / `IPOGURU_DAILY_BUDGET` and `PROVIDER_REQUESTS_*` to the **purchased** plan (application ceilings are capped with `min(PROVIDER_*, IPOGURU_*)`).

Paid plans were **not** changed by this prompt.

---

## 2. What actually works (feeds)

| Feed | Sync path | Public surface | Status |
| --- | --- | --- | --- |
| Catalogue list (`GET /ipos`) | Worker catalog tick → Mongo `ipos` / `companies` | `/api/v1/ipos`, search, calendar | **Working** (mocked + live scope) |
| Issue detail (`GET /ipos/{slug}`) | Planner on financial interval; anchors piggyback for open/upcoming | Detail pages | **Working** when `details` / `details_full` present |
| Current GMP collection (`GET /gmp`) | One poll for open/upcoming | Detail + list summaries | **Working** |
| GMP history | Per due slug; settled windows not re-polled | Detail history | **Working** (Pro `gmp_history`; intraday when vendor returns timeline) |
| Subscription current | Per due slug (listed skipped to protect quota) | Detail | **Working** |
| Subscription history | Per due slug; settled success not repeated | Detail | **Working** on Pro (`subscription_history`) |
| Anchors | With detail for open/upcoming only | Detail profile | **Working** (scope present; empty before allocation) |
| Financials / registrar / documents | From detail document | Detail | **Working** with `details_full` |
| Calendar | Derived from stored IPO dates | `/api/v1/calendar` | **Working** (no separate vendor calendar poll required for public calendar) |
| OFS | Client mappers + `listOfs` / `readOfs` | **No public IPO routes** | **Mapped only** — not synced into IPO catalogue |
| Unlisted | Client mappers + `listUnlisted` / `readUnlisted` | **No public IPO routes** | **Mapped only** — not synced into IPO catalogue |

**Mainboard / SME:** Catalogue mapping accepts only vendor `type` `Mainboard` | `SME`. Other types (including OFS / Unlisted labels) are rejected and counted as validation failures.

**OFS not shown as IPOs:** No web/mobile OFS catalogue. Catalogue ingest rejects OFS/unlisted type strings. Separate Mongo models exist but have no public product API yet.

---

## 3. Schedules (application defaults)

Configured via `SYNC_*` env vars (`apps/api/.env.example`). These are **not** vendor SLAs.

| Job | Default | Notes |
| --- | --- | --- |
| Worker tick | `SYNC_TICK_MS=60000` | Max `SYNC_MAX_CALLS_PER_TICK=8` provider calls |
| Catalogue list | `SYNC_CATALOG_MS=86400000` (24h) | `months=0` full book; one list request |
| GMP collection | `SYNC_GMP_COLLECTION_MS=5400000` (90m, range 60–120) | Stretches when day budget is tight; shortens when reading stale |
| Per-phase GMP / subscription / financial / history | See `.env.example` | Open fastest; upcoming slower; listed slowest |
| Sync lock TTL | `SYNC_LOCK_MS=60000` | Redis required in production workers |

History and subscription history for **closed/allotment** after one success are not re-fetched (completed window). Listed rows are deprioritized so open/upcoming enrichment is not starved. **No unlimited historical backfill.**

---

## 4. Quotas and exhaustion prevention

| Layer | Behavior |
| --- | --- |
| IPO Guru client | `min(PROVIDER_*, IPOGURU_*)`; Redis counters prefixed `ipoguru:`; reserved day pool |
| Vendor 429 burst | Wait `Retry-After` / body delay; retryable |
| Vendor daily quota | Non-retryable; worker stops that call path |
| Circuit breaker | After repeated outages, calls pause briefly |
| Sync tick | Stops further categories in the tick when quota exhausted |
| Distributed locks | Fail closed without Redis (Prompt 72) — skips duplicate multi-host work |

Admin dashboard **minute/day limits** now show the **effective** capped ceilings, not uncapped `PROVIDER_*` alone.

---

## 5. Idempotent upserts and history safety

| Store | Identity | Behavior |
| --- | --- | --- |
| IPO / company | Stable id/slug | `$set` upsert |
| GMP observations | `{ ipoId, observedAt, session }` unique | Same key updates; different slots append |
| Subscription observations | `{ ipoId, cadence, observedOn, observedAt }` unique | Same |
| GMP history window | `ipoId` | Window summary upsert; `timelineLocked` / `truncated` preserved from mapper |
| Sync runs / provider usage | Digested ids | Idempotent until retention |

Malformed provider payloads fail validation (`recordValidationFailure`), reject the sync write (`SyncRejectedError`), and do not invent zeros for missing premiums.

Freshness: `fresh` / `stale` / `missing` via `@ipo-singh/core` resolveFreshness on store and present layers. Public catalogue re-applies IST lifecycle so a stale Open cannot outlive the close date.

---

## 6. Failure handling and recovery

| Symptom | Action |
| --- | --- |
| Worker idle / provider not configured | Set `IPO_DATA_PROVIDER=ipo-guru`, `IPOGURU_ENABLED=true`, budgets, key; restart worker |
| Redis missing in production | Worker exits (Prompt 72). Restore `REDIS_URL` |
| Quota warnings on admin dashboard | Raise intervals, confirm budgets match plan, wait for IST day reset |
| Sync failures > 0 | Admin → Sync history; inspect resource/errorName (no secrets); fix validation or vendor outage |
| Validation failures | Ops `/internal/status` validation count; check rejected catalogue rows |
| Stale public data | Confirm worker running; cache TTLs still serve stale-while-revalidate; label freshness in UI |
| Plan expiry approaching | Rotate/renew vendor subscription; set `IPOGURU_DISPLAY=false` only when stored Guru data must leave public pages |

**Rollback:** Disable `IPOGURU_ENABLED` / leave worker idle — API continues serving last stored Mongo rows. Do not wipe Mongo to “recover.”

---

## 7. Admin visibility

| Surface | Shows |
| --- | --- |
| `/admin` overview | Last successful sync, failure counts, effective quota remaining, vendor remaining, warnings |
| `/admin/sync` | Recent sync runs; manual catalogue sync (super-admin, **non-production** only) |
| `/admin/provider` | Enabled flag, credential configured (boolean), effective budgets, live plan/scopes/limits/expiry from `GET /me` (no API key) |
| `/api/v1/ready` | DB/cache health (jobs stay `not_configured` on API process) |

---

## 8. Connectivity limitations

| Limitation | Impact |
| --- | --- |
| Live `/me` done once from local `.env` | Confirms Pro scopes/limits as of audit date; re-verify before production cutover |
| No full live catalogue sync executed in this prompt | Avoided unlimited backfill / quota burn; mocked sync suites cover paths |
| OFS / unlisted not productized | Scopes exist; intentional non-exposure as IPOs |
| `gmp_intraday` | Used when history payload includes timeline; not a separate hot poll |
| Application vs vendor counter prefixes | Separate Redis keys; both gates fail closed |

---

## 9. Verification run (Prompt 73)

| Check | Result |
| --- | --- |
| Mocked provider / sync / catalog / history / subscription tests | Run with API suite (see completion report) |
| Live `GET /me` | OK — Pro scopes/limits recorded above |
| Unlimited history backfill | **Not started** |
| Paid plan change | **Not performed** |
| API key printed | **No** |
