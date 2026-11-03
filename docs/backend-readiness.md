# Backend readiness

Audit of the Express API built in Prompts 07–13, plus the protected operational status added in Prompt 14. IPO Guru sync is `GET /ipos` and one `GET /gmp` collection.

## 1. Architecture overview

The backend is `apps/api`, an Express 5 application on Node.js 24. Shared request and response shapes live in `packages/contracts`. IPO calculations live in `packages/core`. The public site in `apps/web` does not call a market-data provider.

```text
public clients
    │
    ▼
Express API  ──reads──►  MongoDB catalogue
    │                         ▲
    │                         │ writes
    └── Redis cache           │
                              │
                     sync worker (separate process)
                              │
                              ▼
                     provider gateway
                        ├── mock (development and tests only)
                        └── IPO Guru Pro v2 (`GET /ipos` and `GET /gmp` when enabled)
```

The API process serves stored IPO data. The worker is the only process that may call a provider. It calls IPO Guru for the catalogue list and the current-GMP collection only when `IPOGURU_ENABLED=true`. Public catalogue reads use Redis when `REDIS_URL` is set and do not spend the provider quota. A missing or down cache does not take the API out of service.

MongoDB document shapes are separate from public DTOs. Writes are validated before insert. Raw provider payloads are rejected. Registrar links are returned only as `http` or `https` addresses without credentials, with `verification: "verify-before-use"`.

## 2. Implemented routes

Public reads, all `GET`:

| Path | Response |
| --- | --- |
| `/api/v1/health` | Liveness. Always 200 while the process is up. |
| `/api/v1/ready` | Readiness. Database must be ok, or unset outside production. Cache does not block readiness. |
| `/api/v1/ipos` | Page of IPO summaries |
| `/api/v1/ipos/:slug` | One IPO |
| `/api/v1/ipos/:slug/gmp` | Current GMP |
| `/api/v1/ipos/:slug/gmp/history` | GMP observations |
| `/api/v1/ipos/:slug/subscription` | Current subscription |
| `/api/v1/ipos/:slug/subscription/history` | Subscription observations |
| `/api/v1/ipos/:slug/financials` | Statement periods |
| `/api/v1/ipos/:slug/registrar` | Registrar |
| `/api/v1/calendar` | Stored open, close, allotment, and listing dates |
| `/api/v1/search` | IPO summaries. `q` is required |

`/api/v1/gmp`, `/api/v1/subscriptions`, `/api/v1/auth`, and `/api/v1/sync` are not routes.

Protected operations, not part of the public catalogue:

| Path | Response |
| --- | --- |
| `GET /internal/status` | Provider counts, quota, cache, sync, validation failures, and dependency health |

The status route answers `404` with the same body as an unknown route unless the `X-Ops-Token` header matches `OPS_TOKEN`. A token in the query string is ignored. The body omits credentials, connection strings, and sync error names. `/api/v1/health` and `/api/v1/ready` do not include these counts. On the API process, `provider` and `jobs` in the public readiness body stay `not_configured`.

## 3. Required environment variables

Copy `apps/api/.env.example` to `apps/api/.env` for local development. Production ignores that file.

| Variable | Required | Role |
| --- | --- | --- |
| `NODE_ENV` | No. Default `development` | `production` requires `MONGODB_URI` and rejects `IPO_DATA_PROVIDER=mock` |
| `HOST`, `PORT` | No. Default `0.0.0.0:4000` | Bind address |
| `CORS_ORIGINS` | Production, before a browser client | Comma-separated origins. `*` is rejected |
| `MONGODB_URI` | Production | Database name must include `dev` or `test` outside production |
| `REDIS_URL` | Recommended for more than one API or worker | Shared cache, locks, and quota |
| `IPO_DATA_PROVIDER` | No | `mock` or `ipo-guru`. Unset leaves the provider idle |
| `OPS_TOKEN` | To open `/internal/status` | 16–128 characters. Not serialized into config JSON |
| `SYNC_TOKEN` | For `npm run sync:once` | Same character rules. Refused in production |

Rate limits, HTTP timeouts, cache TTLs, provider quota, and sync intervals have defaults in the example file. Invalid values fail startup with the variable name and without the supplied value.

Default provider quota is 30 requests per minute and 1,000 per day, with 50 reserved. Default public limits are 120 catalogue, 30 search, and 60 detail requests per minute per address. Health and readiness are exempt.

Default fresh cache windows: GMP 120 minutes, subscription 60 minutes (30 minutes near close, 24 hours after close), listings and issue details 24 hours, history 7 days, registrars 24 hours. Stale windows keep the last value through an outage.

## 4. Development startup commands

From the repository root, with Node.js 24:

```bash
npm install
npm run dev
npm run dev:api
npm run build
npm run start:api
npm run start:worker
SYNC_TOKEN=development-token-1 IPO_DATA_PROVIDER=mock MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-dev npm run sync:once
npm test
npm run typecheck
npm run lint
```

`npm run dev` starts the website on port 3000 and the API on port 4000. It does not start the worker. Set `OPS_TOKEN` before calling:

```bash
curl -s -H "X-Ops-Token: $OPS_TOKEN" http://127.0.0.1:4000/internal/status
```

Use a development database name that contains `dev` or `test`. Do not point `MONGODB_URI` at a production database.

## 5. Test results

Command: `npm test && npm run typecheck && npm run lint && npm run build`

| Package | Tests |
| --- | --- |
| `@ipo-singh/api` | 111 passed |
| `@ipo-singh/web` | 11 passed |
| `@ipo-singh/contracts` | 5 passed |
| `@ipo-singh/core` | 17 passed |
| `@ipo-singh/design-tokens` | 2 passed |

Typecheck and lint passed. The API bundle targets Node.js 24. The Next.js production build succeeded. It still warns that `metadataBase` is unset and falls back to `http://localhost:3000`.

The suite uses the mock provider and disposable fixtures. MongoDB integration tests use `mongodb-memory-server` and the database name `ipo-singh-test`. They do not read `MONGODB_URI`. Covered behavior includes cache hits, misses, and stale reads; public API responses; provider timeouts and malformed payloads; MongoDB upserts and indexes; sync success, retry, lock skipping, and quota stop; quota exhaustion; rate limits; PAN rejection; CORS; redaction; and shutdown.

`process.version` in this run starts with `v24.`. Root and API `engines` are `24.x`. Workspace scripts `dev`, `dev:api`, `build`, `start:api`, `start:worker`, `sync:once`, `lint`, `typecheck`, and `test` are present.

## 6. Known limitations

- IPO Guru `listIpos` is `supported` only when the backend client is enabled. The other capabilities stay `unverified` and perform no I/O.
- The website reads `/api/v1` on the IPO Singh API. It does not call IPO Guru. An empty database stays an empty list.
- Public readiness reports `provider: "not_configured"` and `jobs: "not_configured"` because the API process is not the worker.
- Sync counts, provider endpoint counts, and provider latency on `/internal/status` come from MongoDB rows written by the worker. Cache hits, misses, stale responses, and validation failures are counts for the API process that answered the request.
- Minute and day quota on that endpoint are shared across processes only when `REDIS_URL` is set. Without Redis, the snapshot is the API process counter.
- Email-and-password sign-in is described in `docs/auth-architecture.md`. Email verification and password reset are not sent. There is no admin panel yet. The status route is a JSON payload for that panel.
- Registrar hosts are not on an official allowlist. A stored `https` link is still `verify-before-use`.
- `metadataBase` is unset, so Open Graph URLs use `http://localhost:3000` during the production build.

## 7. Security considerations

- IPO Guru credentials, when they exist later, stay in the API and worker environment. Public responses do not include them. Web and mobile clients do not call IPO Guru.
- `OPS_TOKEN` and `SYNC_TOKEN` are compared or required on the server. `OPS_TOKEN` is omitted from `JSON.stringify` of the config. Logs redact token, PAN, authorization, and database URL fields.
- CORS is an allowlist. Credentialed browser requests are accepted only for an origin on that list. Security headers send `nosniff`, `default-src 'none'`, `no-referrer`, and frame denial. HSTS is added only in production.
- Catalogue, search, detail, and auth paths are rate limited. The auth bucket is separate and defaults to 10 requests per window. Search is capped at 20 results and 2 characters. Cursors cannot pass the 2,000-row read cap. Bodies default to 100kb. Database reads use a 2-second maximum time.
- PAN and application-number fields are rejected. Markup in stored names and titles is removed before JSON is sent.
- Unknown errors return a fixed 500 body. Production validation errors say `Invalid value.` Shutdown stops new work, waits up to `SHUTDOWN_TIMEOUT_MS`, and closes MongoDB and Redis.
- `npm run sync:once` is refused in production and requires `SYNC_TOKEN` in development. There is no public HTTP route that starts a sync.

## 8. Prerequisites for real IPO Guru Pro integration

The backend can accept a real client behind the existing gateway, quota gate, cache, and worker. It should not call IPO Guru until all of the following are true:

1. IPO Guru Pro **API v2** endpoint paths and response schemas are verified from the vendor documentation. v1 is out of scope. The documentation audit is in `docs/ipoguru-v2-integration.md`, `docs/ipoguru-field-mapping.md`, `docs/ipoguru-request-budget.md`, and `docs/data-rights-checklist.md`. `listIpos` calls `GET /ipos` when `IPOGURU_ENABLED=true`. Current GMP calls unfiltered `GET /gmp` on a 60–120 minute interval, default 90 minutes. The worker also calls GMP history, current subscription, subscription history, and `GET /ipos/{slug}` for due issues. `GET /me` remains the protected account probe. Adapter methods stay unverified so the mock planner does not call them again.
2. Each catalogue feature changes from `unverified` to `supported` only after a client for that feature exists. Documented fields that have no domain home stay unmapped and must not be invented into the public API.
3. The API key lives in the worker and API process environment. It is not committed, logged, or sent to web or mobile clients.
4. Commercial use of the data is confirmed. Responses stay behind the IPO Singh cache and quota.
5. Production has `MONGODB_URI`, `REDIS_URL`, `CORS_ORIGINS`, and `OPS_TOKEN`. `IPO_DATA_PROVIDER=mock` stays rejected in production.
6. The worker runs as its own process. The website and a visitor request do not start it.
7. A staging sync with the mock provider has already been observed on `GET /internal/status` before the live provider is selected.

`IPO_DATA_PROVIDER=ipo-guru` stays idle unless `IPOGURU_ENABLED=true`. The enabled worker refreshes the catalogue, one current-GMP collection, GMP history, current subscription, subscription history, and one `GET /ipos/{slug}` document for due issues. It does not call a per-IPO current GMP URL. Public pages read MongoDB and Redis.
