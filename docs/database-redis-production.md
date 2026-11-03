# MongoDB Atlas and Redis — production preparation

**Prompt:** 72\
**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Connection management, indexes, pooling, graceful shutdown, Redis cache/locks, health checks, staging isolation, backups, secrets.\
**Constraints:** No production records altered. No infrastructure purchased or enabled. No secrets printed. Placeholders only below.

Related: `docs/backend-readiness.md`, `docs/sync.md`, `docs/sync-worker-ops.md`, `apps/api/.env.example`.

---

## 1. Architecture (safe defaults)

```text
API process                     Worker process(es)
   │                                  │
   ├─ MongoDB (required in prod)      ├─ MongoDB (required)
   ├─ Redis (optional for reads)      └─ Redis (required in production)
   │     cache miss → origin DB              distributed sync locks + quotas
   └─ /api/v1/ready
         database blocks readiness
         cache reported but does not block API
```

- Catalogue reads may run without Redis (degraded / no shared cache).
- **Workers in `NODE_ENV=production` refuse to start without `REDIS_URL`.**
- When Redis is configured but temporarily down, sync locks **fail closed** (skip the job). They do **not** fall back to unsafe multi-host local locks.

---

## 2. Environment variables (names only)

Use process environment or a secret manager. Never commit real URIs or passwords. `apps/api/.env` is for local development only; production ignores that file for Mongo (`loadLocalEnv`).

### MongoDB

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `MONGODB_URI` | Connection string including database path | Required. Prefer `mongodb+srv://…/ipo-singh?…` |
| `MONGODB_MAX_POOL_SIZE` | Pool upper bound (default `10`) | Tune per Atlas tier; keep modest |
| `MONGODB_MIN_POOL_SIZE` | Pool lower bound (default `0`) | Usually `0`–`2` |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Server selection (default `5000`) | Keep short for fail-fast readiness |
| `MONGODB_CONNECT_TIMEOUT_MS` | Connect timeout (default `5000`) | |
| `MONGODB_SOCKET_TIMEOUT_MS` | Socket timeout (default `20000`) | |
| `GMP_RETENTION_DAYS` | Observation TTL policy | Default `400` |
| `SUBSCRIPTION_RETENTION_DAYS` | | Default `400` |
| `SYNC_HISTORY_RETENTION_DAYS` | | Default `90` |
| `PROVIDER_USAGE_RETENTION_DAYS` | | Default `90` |

**Placeholder URI shapes (no credentials):**

```text
# Local
MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-dev

# Staging Atlas (isolated DB name)
MONGODB_URI=mongodb+srv://CLUSTER_HOST/ipo-singh-staging?retryWrites=true&w=majority

# Production Atlas (dedicated cluster recommended)
MONGODB_URI=mongodb+srv://CLUSTER_HOST/ipo-singh?retryWrites=true&w=majority
```

URI credentials must not appear in logs. Config seals `uri` as non-enumerable (`config/mongo.ts`).

### Redis

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `REDIS_URL` | `redis://` or `rediss://` URL | Required for production **workers**; recommended for API cache |
| `REDIS_CONNECT_TIMEOUT_MS` | Connect timeout (default `5000`) | |
| `SYNC_ALLOW_PROCESS_LOCAL_LOCK` | Single-process local locks | **`true` only for one local worker without Redis.** Refused when `NODE_ENV=production`. |

**Placeholder:**

```text
REDIS_URL=redis://127.0.0.1:6379/0
# TLS to managed Redis:
# REDIS_URL=rediss://REDIS_HOST:6380/0
```

### Isolation

| Environment | `NODE_ENV` | Database name rule |
| --- | --- | --- |
| Local / CI | `development` / `test` | Must include `dev`, `test`, or `staging`; must not include `prod` |
| Staging | Prefer `development` or dedicated staging deploy with non-production `NODE_ENV` | e.g. `ipo-singh-staging` on a **separate** Atlas project/cluster |
| Production | `production` | e.g. `ipo-singh` on a dedicated cluster |

Non-production processes calling a production-named database are rejected (`assertSafeDatabase`).

---

## 3. MongoDB connection, pooling, shutdown

**Code:** `apps/api/src/db/connection.ts`, `config/mongo.ts`

| Concern | Behavior |
| --- | --- |
| Pooling | `maxPoolSize` / `minPoolSize` from env; passed to `mongoose.connect` |
| Timeouts | `serverSelectionTimeoutMS`, `connectTimeoutMS`, `socketTimeoutMS` |
| Buffering | `bufferCommands: false` — fail fast if disconnected |
| Indexes | `ensureIndexes()` on connect (additive `createIndexes`) |
| Health | `check()` → `ping: 1`; returns `ok` / `unavailable` |
| Shutdown | API and worker call `database.close()` → `mongoose.disconnect()` on SIGTERM/SIGINT |

**Not done in this prompt:** purchasing Atlas, enabling backups in the Atlas UI, or connecting to a live cluster from CI.

---

## 4. Indexes (additive only)

Ensured at startup via `ensureIndexes()` (`db/models/index.ts`). No destructive drops.

### IPO list / filter / history support

| Collection | Indexes (representative) | Supports |
| --- | --- | --- |
| `ipos` | unique `slug`; `board`; `status`; **`{ board, status, dates.openDate }`**; open/close/allotment/listing dates; sparse unique provider mapping | Board lists, status filters, date sorts |
| `companies` | `name`; sparse `symbol` | Search by name/symbol (catalogue also filters in memory after load) |
| `gmp_observations` | unique `{ ipoId, observedAt, session }`; TTL `expiresAt` | Historical GMP |
| `gmp_history_windows` | unique `ipoId` | History window |
| `subscription_observations` | unique identity key; TTL `expiresAt` | Historical subscription |
| Accounts / sessions / watchlist / notifications / promotions / allotment | Per-model indexes | Auth and product features |

Catalogue HTTP filters still load directory rows with a bounded read limit and filter in application code; indexes keep Mongo scans reasonable as the catalogue grows.

---

## 5. Redis cache, locks, multi-worker safety

**Code:** `cache/connection.ts`, `cache/redis-store.ts`, `cache/service.ts`, `jobs/lock.ts`, `worker.ts`

| Mode | API reads | Worker sync locks |
| --- | --- | --- |
| No `REDIS_URL` | Unconfigured cache; origin DB | Production worker **exits**. Non-prod needs `SYNC_ALLOW_PROCESS_LOCAL_LOCK=true` for a **single** process |
| Redis up | Shared cache + quotas | Shared `SET NX` locks (`ipo-singh:sync-lock:*`) |
| Redis down after configure | Cache checks `unavailable`; API stays ready | `setIfAbsent` throws → **acquire returns null** → job skipped |

**Unsafe fallback removed:** previously a missing store still granted a process-local lock that looked successful on every host. Now missing store fails closed unless `allowProcessLocal` is explicitly set.

Redis client options: bounded reconnect (`retryStrategy` up to 8), `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, TLS only via `rediss://`.

---

## 6. Health checks

| Endpoint | Role |
| --- | --- |
| `GET /api/v1/health` | Liveness — process up |
| `GET /api/v1/ready` | Readiness — `database` must be `ok` (or unset outside production). `cache` is reported (`ok` / `unavailable` / `not_configured`) but does **not** take the API out of service |
| `GET /internal/status` | Ops token gated; dependency + quota + cache metrics (no URIs/secrets) |

Readiness probes time out after 2 seconds (`modules/health/routes.ts`).

---

## 7. Atlas settings checklist (manual — do not automate from this repo)

Perform in the Atlas UI for **staging** and **production** projects separately:

1. **Separate projects/clusters** for staging vs production.
2. **Network access:** IP allowlist or private endpoint for API/worker egress only; no `0.0.0.0/0` long term.
3. **Database user:** least privilege — read/write on application database only; no Atlas admin on app users.
4. **Auth:** SCRAM or X.509; rotate credentials via secret manager.
5. **TLS:** required (`mongodb+srv`).
6. **Backups:** enable Cloud Backup / snapshot schedule appropriate to the tier; define restore runbook (below).
7. **Monitoring:** alert on disk, connections, replication lag.

This repository does **not** store Atlas API keys or open production firewall rules.

---

## 8. Redis provider checklist (manual)

1. Managed Redis with TLS (`rediss://`) in production.
2. Auth token in secret manager; ACL limited to the app key prefix where supported.
3. Memory policy: prefer `noeviction` or carefully test eviction — lock keys and quota counters must not vanish unpredictably under pressure.
4. Separate Redis DB index or instance for staging vs production.
5. Maxmemory and connection limits sized for cache TTLs in `.env.example`.

---

## 9. Backup and restore

### MongoDB (Atlas)

| Step | Action |
| --- | --- |
| Backup | Atlas continuous cloud backup / snapshots per project policy |
| Verify | Periodic restore drill to a **new** temporary cluster or `*-restore-test` database |
| Restore | Restore snapshot → new cluster → point app staging `MONGODB_URI` at restore → validate `/ready` and sample catalogue reads → cut over only with explicit authorization |
| Rollback | Keep previous cluster URI in secret manager version history; switch `MONGODB_URI` back; restart API + worker |

**Never** restore over production without a written change window and authorization. This prompt does not run restores.

### Redis

| Step | Action |
| --- | --- |
| Backup | Treat Redis as **ephemeral cache + locks**. Do not rely on Redis as system of record |
| Restore | Empty Redis is safe: API degrades to DB; workers re-acquire locks after reconnect |
| Rollback | Point `REDIS_URL` at prior instance; restart processes |

---

## 10. Secret management and least privilege

| Practice | Detail |
| --- | --- |
| Storage | Platform secret store / sealed env — not git, not mobile/`NEXT_PUBLIC_*` |
| Mongo user | CRUD on app DB only |
| Redis | Password/ACL; no shared prod/staging URLs |
| Logging | Redact connection strings (`shared/redact.ts`); config seals URI/URL |
| Rotation | Rotate Atlas DB user and Redis auth independently; rolling restart API then worker |

---

## 11. Rollback of schema / index changes from Prompt 72

Additive indexes only:

- `ipos`: `{ board: 1, status: 1, dates.openDate: -1 }`
- `companies`: sparse `{ symbol: 1 }`

Rollback (optional, if an index must be removed after review):

```js
// mongosh against the target database — run only with authorization
db.ipos.dropIndex({ board: 1, status: 1, "dates.openDate": -1 })
db.companies.dropIndex({ symbol: 1 })
```

Application code remains compatible if indexes are absent (slower queries). Prefer leaving additive indexes in place.

Lock behavior change: workers without Redis no longer silently take process-local locks in production. Rollback would reintroduce unsafe multi-host locking — **do not roll that back**.

---

## 12. Connectivity limitations (this audit)

| Limitation | Impact |
| --- | --- |
| No live Atlas / managed Redis from this session | Settings are documented; not verified against a cloud project |
| Local tests use `mongodb-memory-server` / in-memory cache where applicable | Proves indexes and lock semantics; not a substitute for Atlas network/TLS drills |
| Catalogue search is largely in-process after a bounded list read | Indexes help growth; a future Mongo text/atlas search is out of scope |
| Redis optional on API | Correct for availability; production workers still need Redis |
| Staging `NODE_ENV=production` against a staging DB | Allowed by name rules only when `NODE_ENV` is production; prefer separate non-prod deploys with `ipo-singh-staging` |

---

## 13. Verification performed (local / isolated)

| Check | Result |
| --- | --- |
| Lock unit tests (`jobs/lock.test.ts`) | Fail-closed without store; shared-store exclusion; Redis error fail-closed |
| `assertSafeDatabase` allows `staging`, rejects `prod` in non-prod | Updated tests |
| Persistence index expectations | Updated for board+status compound and company symbol |
| Full API suite | See Prompt 72 completion report after test run |
| Live production Mongo/Redis | **Not contacted** |

---

## 14. Code touchpoints (Prompt 72)

| File | Change |
| --- | --- |
| `jobs/lock.ts` | Fail-closed without store; opt-in `allowProcessLocal` |
| `jobs/lock.test.ts` | New coverage |
| `worker.ts` | Production requires Redis; opt-in local lock outside production |
| `db/mongo-target.ts` | Allow `staging` database names in non-prod |
| `db/models/ipo.ts` / `company.ts` | Additive indexes |
| `accounts/catalog-sync.ts` | Process-local only when store missing (manual sync already blocked in production) |
| `accounts/admin-allotment.ts` | No local lock fallback |
| `apps/api/.env.example` | Document Redis / local-lock policy |
| `docs/database-redis-production.md` | This document |
