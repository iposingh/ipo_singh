# IPO Singh public API

Version 1 read API for the website and future Android and iOS clients. Responses use the shared contracts in `packages/contracts`.

The handlers read MongoDB through the repository layer and cache successful responses in Redis when `REDIS_URL` is set. A request does not call IPO Guru or any other market-data provider. These routes do not read provider credentials, and responses never include them. The website server reads these routes. It does not call IPO Guru. `IPO_SINGH_API_ORIGIN` overrides the default `http://127.0.0.1:4000`.

HTTP responses send `Cache-Control: no-store`. The Redis cache is server-side. A cache hit does not read MongoDB again and does not consume the provider quota.

If the database is not configured, or it is configured and empty, list, search, and calendar return `200` with `items: []` and `page.totalCount: 0`. A slug that is not stored returns `404` with `code: "not_found"`. The API does not fill either case with sample issues.

## Records

Amounts are rupees. Subscription figures are times subscribed. Percents are plain numbers. Dates are `YYYY-MM-DD`. Timestamps are ISO-8601 with an offset. `null` means the value was not stored. `0` is a real zero. `freshness` is `missing`, `fresh`, or `stale`.

Every resource includes `provenance` with `sourceName`, `retrievedAt`, and `freshness`. Registrar responses also include `verification: "verify-before-use"`.

A company may store a trading symbol. The public IPO object does not add a symbol field. Search matches the company name, the stable slug, and the symbol when one is stored.

`status=closed` includes `allotment`. A missing status is returned only when the request does not filter by status. Sort options are `open`, `close`, and `listing`. Missing dates sort last. The default sort is open date ascending, then slug.

## Pagination

`limit` defaults to 20 and cannot exceed 100. Search accepts at most 20 and requires `q` of at least 2 characters. `cursor` is an opaque string from `page.nextCursor` and cannot page past the 2000-issue read cap. A missing or invalid query parameter returns `400` with `code: "validation_error"` and `fieldErrors`. The total is `0` when the result is known to be empty and `null` when that safety cap is reached.

## Routes

| Method and path | Response |
| --- | --- |
| `GET /api/v1/ipos` | Page of IPO summaries |
| `GET /api/v1/ipos/:slug` | IPO |
| `GET /api/v1/ipos/:slug/gmp` | Current GMP, or `gmp: null` when none is stored |
| `GET /api/v1/ipos/:slug/gmp/history` | GMP observations, oldest first |
| `GET /api/v1/ipos/:slug/subscription` | Current subscription, or `subscription: null` |
| `GET /api/v1/ipos/:slug/subscription/history` | Subscription observations, oldest first |
| `GET /api/v1/ipos/:slug/financials` | Statement periods. An empty `periods` array means none are stored |
| `GET /api/v1/ipos/:slug/registrar` | Registrar, or `registrar: null` |
| `GET /api/v1/calendar` | Open, close, allotment, and listing dates that are stored |
| `GET /api/v1/search` | Page of IPO summaries. `q` is required |

List and search accept `board` (`mainboard` or `sme`), `status` (`upcoming`, `open`, `closed`, `listed`, or `allotment`), `q`, `sort`, `direction` (`asc` or `desc`), `limit`, and `cursor`.

Search also accepts inclusive `from` and `to` calendar dates. An issue matches when a stored open, close, or listing date falls in the range. Allotment dates are not part of this filter, and an issue with none of those dates does not match. `from` after `to` is a validation error. List requests do not accept `from` or `to`.

Calendar accepts `board`, `from`, `to`, `limit`, and `cursor`. `from` and `to` are inclusive calendar dates.

Directory, search, and calendar share the listings cache. GMP uses the GMP TTL. The current subscription uses the bidding-phase TTL: active, the shorter closing window near the end of the close date in Asia/Kolkata, or the closed window after that instant. History and financials use the history TTL. The issue detail uses the issue TTL. The registrar uses the registrar TTL.

## Errors

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `validation_error` | Query or slug is invalid |
| 401 | `unauthenticated` | A later account route requires a session |
| 403 | `forbidden` | A cookie-authenticated mutation failed the CSRF check |
| 404 | `not_found` | Slug is not stored, or the route does not exist |
| 429 | `rate_limited` | Public rate limit, provider quota, or cache miss storm on a metered read |
| 503 | `unavailable` | Database is down, a stored issue cannot be served, or account lookup failed while a credential was presented |

`/api/v1/gmp`, `/api/v1/subscriptions`, and `/api/v1/sync` are not public routes. `GET /api/v1/auth` still answers `404`. Password registration and login are `POST /api/v1/auth/register` and `POST /api/v1/auth/login`. Logout, logout from every device, refresh, the current session, profile, preferences, password change, and single-session revoke are the other routes under that prefix. The design is in `docs/auth-architecture.md`. Catalogue reads do not require a session. A signed-in watchlist is `GET`, `POST`, and `DELETE` under `/api/v1/watchlist`. Each row stores the user id, the IPO id, the date added, and an optional note. Current IPO details are joined from the public listings cache and are not copied into the row. In-app notifications are `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/:id/read`, `POST /api/v1/notifications/read-all`, and `PATCH /api/v1/notifications/preferences`. A row is created only from a fresh stored date, GMP pair, subscription total, schedule change, or an explicit announcement. The sync worker creates those rows from data already stored, in bounded watchlist pages, and does not call IPO Guru once per user. Push stays `not-sent`. Email and SMS are not sent. `GET /internal/status` answers `404` unless `X-Ops-Token` matches `OPS_TOKEN`. It is not a public catalogue route. When `IPOGURU_ENABLED=true`, `GET /internal/ipoguru/account` with the same header performs one `GET /me` against IPO Guru and the following status response repeats that account. The route stays dark while the client is disabled. Neither route is a catalogue sync. Administrator routes live under `/api/v1/admin` and require an `admin` or `super-admin` session from the same account system. Role changes, revocation of another person's sessions, provider status, and the audit list are limited to a super admin. Role changes and revocation also require that person's current password. Responses omit password hashes, API keys, database addresses, and `OPS_TOKEN`. `POST /api/v1/auth/register` cannot set a role. There is no public administrator-creation route. `GET /api/v1/admin/dashboard`, `GET /api/v1/admin/ipos`, and `GET /api/v1/admin/sync` are read-only for an admin or super admin. Counts are null when the store cannot be read. `POST /api/v1/admin/sync` is limited to a super admin, requires the current password, and runs at most one catalogue request outside production when the local quota snapshot has remaining requests. It does not accept a category, and it does not edit stored financial values. `GET /api/v1/promotions` is public and returns the home carousel. With no stored banners, `managed` is false and the website keeps its own house slides. Stored banners that are active and inside their schedule replace those slides, in priority order and then the saved order, at most eight. An empty managed list leaves the carousel off. Images are PNG, JPEG, or WebP, served with a fixed image type and `nosniff`. Draft and archived images are not public. Banner create, edit, upload, activation, reorder, archive, and delete require an admin session. A house destination stays on this site. An external destination must be `https` and labeled Sponsored or Advertisement.

## Safeguards

Browser origins come from `CORS_ORIGINS`. A wildcard is rejected. Credentialed requests are allowed only for an origin on that list, so a future website session can use cookies. Responses send `nosniff`, a JSON content-security policy of `default-src 'none'`, `no-referrer`, and `DENY` framing. HSTS is added only when `NODE_ENV` is production.

Catalogue, search, detail, `/api/v1/auth`, and `/api/v1/admin` routes have separate per-address limits. The auth and admin limits default to 10 per window and cannot exceed the catalogue limit. `/api/v1/health` and `/api/v1/ready` are exempt so probes keep working. A request that repeats a PAN or an application number is rejected and the value is not written to the log. Registrar links are returned only when they are `http` or `https` addresses without credentials, and `verification` stays `verify-before-use`. Markup in stored names and titles is removed before the JSON response.

The API process does not run synchronization. `SYNC_MODE=once` is refused in production and, in development, also requires `SYNC_TOKEN`. Request bodies default to 100kb. Database reads use a maximum time and the 2000-row catalogue cap. Readiness checks time out after 2 seconds. A hung database check reports `database: "unavailable"` and does not include a connection string.
