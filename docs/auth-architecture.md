# IPO Singh account architecture

This document is the shared account design for the website and the future Expo app. Sign-in is email and password. Email verification, password-reset mail, and third-party login are not part of this design.

## Audit

Before this work, IPO Singh had no user identity.

- `GET /api/v1/auth` has no handler and still answers `404`. Sign-in lives under `/api/v1/auth/register`, `/login`, `/logout`, `/logout-all`, `/refresh`, and `/session`.
- `/account`, `/login`, and `/register` are website pages. IPO lists do not require a session.
- GMP “session” in market data means a trading session, not a user session.
- CORS previously refused credentials. It now allows credentials only for origins listed in `CORS_ORIGINS`. A wildcard origin is still rejected.
- The rate limiter had catalogue, search, and detail buckets. Health and readiness stay exempt.
- Logs already redact `cookie`, `authorization`, `token`, `password`, and `pan`. Account code must still avoid writing a raw token under any other key.
- Deferred IPO modules (`gmp`, `ipos`, `subscriptions`) stay off the public router. Account code lives in `apps/api/src/accounts/` and is not an IPO module.
- Redis stores IPO cache entries and quota counters. It is not a session store. Revocation has to be visible on the next request, so MongoDB is the session authority.
- Public IPO pages do not require a session. The running API on port 4000 is unchanged by this design: with no database it still serves an empty catalogue.

## One identity

Web and mobile share one person, one set of devices, and one set of sessions. The mobile app does not get a second user table or a second token format.

The public identifier is a UUID. It is not an IPO slug. Email, stored lowercase and trimmed, is the unique identity. The address is at most 254 characters. A missing email is not stored, so the unique index does not collide on null. Closing an account does not delete the row and does not free the email.

Roles are `member` (User, the default), `admin`, and `super-admin`. Registration always stores `member`. A person cannot change their own role, and there is no public route that creates an administrator. The first super admin is created only at API start when `IPO_SINGH_BOOTSTRAP_ADMIN_EMAIL` and `IPO_SINGH_BOOTSTRAP_ADMIN_PASSWORD` are both set and no super admin exists. Those values are never hardcoded and are not written to logs. An email that already belongs to an account is not promoted. `OPS_TOKEN` remains a separate server secret for `/internal` and is not an account role.

The account does not collect PAN, demat, phone, or brokerage credentials. A password is accepted only as an Argon2id hash in `passwordHash`. Public response objects are strict and reject the hash, PAN, and tokens.

## Administrator access

`requireAccount` still gates member routes such as the watchlist and notifications. `requireRole` gates `/api/v1/admin`. An admin can read their own admin session. A super admin can change another person's role, revoke that person's sessions, read a redacted provider status, and list audit events. Role changes and session revocation require the caller's current password. Revocation uses the existing `operator` session reason and the same opaque session tokens, so a revoked access cookie fails on the next request. The provider view reports only whether a provider is selected, whether IPO Guru is enabled, and whether a credential is configured. The website serves `/admin` outside the public site shell and does not offer administrator registration. The dashboard, IPO inspection, sync history, cache counters, and account counts are available to an admin. A super admin can start one catalogue synchronization after confirming the current password. Production, a missing provider, and an exhausted or unknown quota refuse that call before any provider request. The audit action is `manual_sync`. Inspection returns the slug, company name, board, status, freshness, and fetch time. It does not return prices or provider identifiers. An admin can also create, edit, schedule, reorder, archive, and delete promotional banners. Those changes are audited as `banner_change`. Uploaded images stay on the API and are not written into the public site files.

## Collections

| Collection | Model | Holds |
| --- | --- | --- |
| `account_users` | `AccountUser` | Identity, role, preferences, lifecycle timestamps |
| `account_devices` | `AccountDevice` | A browser or a future iOS or Android install |
| `account_sessions` | `AccountSession` | Hashed access, refresh, and CSRF secrets |
| `admin_audit_events` | `AdminAuditEvent` | Administrator action, outcome, actor, and target. Passwords and tokens are not stored |

Preferences sit on the user:

- `colorScheme`: `system`, `light`, or `dark`
- `defaultBoard`: `mainboard`, `sme`, or null
- `timeZone`: `Asia/Kolkata` only

Lifecycle states are `pending`, `active`, `suspended`, and `closed`.

Audit timestamps are `createdAt`, `updatedAt`, `statusChangedAt`, `lastAuthenticatedAt`, `suspendedAt`, and `closedAt`. A session also stores `rotatedAt`, `revokedAt`, and `revokeReason` (`user`, `rotation_reuse`, `suspended`, `closed`, `operator`).

`issueSession` runs only for an `active` user and a device that belongs to that user and is not revoked. `suspendUser` and `closeUser` revoke every session for that user. Rows stay in MongoDB so the audit trail remains. There is no TTL index on sessions. Expiry is checked in code.

## Indexes

- `account_users.email` is unique with a partial filter `{ email: { $type: "string" } }`.
- `account_users.status` is indexed for lifecycle queries.
- `account_devices` is indexed by `userId` and `lastSeenAt`.
- `account_sessions.accessTokenHash` is unique.
- `account_sessions.refreshTokenHash` is unique.
- `account_sessions.previousRefreshTokenHash` is indexed and is not unique, because many rows have no previous hash.
- `account_sessions` is indexed by `userId` and `revokedAt` for revocation.

`ensureIndexes()` registers these models with the IPO collections. A connection creates the indexes. Session lookup is not an IPO Guru call and does not spend provider quota.

## Tokens

Access and refresh secrets are opaque random 32-byte values, encoded as base64url. The API stores SHA-256 hex hashes. Comparison uses a timing-safe equal on equal-length hashes. A presented token must match `^[A-Za-z0-9_-]+$` and be at most 128 characters.

These are not JWTs. The server can revoke a session by writing `revokedAt`, and the next request sees it.

| Secret | Lifetime | Stored |
| --- | --- | --- |
| Access | 15 minutes | `accessTokenHash` |
| Refresh | 30 days | `refreshTokenHash` |
| CSRF | Same as the access cookie | `csrfTokenHash` |

Refresh rotation replaces the access, refresh, and CSRF hashes. The previous refresh hash is kept once. If that previous secret is presented again, the session is revoked with reason `rotation_reuse`.

The raw secrets are returned only by `issueSession` and `rotateSession`, for a future route to place in a cookie or in SecureStore. They are not fields on `publicAccountSchema`, `publicSessionSchema`, or `accountSessionResponseSchema`.

## Website cookies

A later sign-in route will set three cookies. Local HTTP development cannot use the `Secure` flag, so `Secure` is added only in production. The `__Host-` prefix is not used, because it requires `Secure` and would break local HTTP.

| Cookie | Script access | SameSite | Path | Purpose |
| --- | --- | --- | --- | --- |
| `ipo_singh_access` | HttpOnly | `Lax` | `/` | Sent to the API with normal browsing |
| `ipo_singh_refresh` | HttpOnly | `Strict` | `/api/v1/auth` | Sent only to future auth routes |
| `ipo_singh_csrf` | Readable by the site | `Lax` | `/` | Echoed in `x-csrf-token` |

The access and refresh values must not be copied to `localStorage`, `sessionStorage`, or a frontend log. The existing app-promo dismissal key in `sessionStorage` is unrelated and stays as it is.

When an access cookie is present, the API may look up that session. Catalogue handlers still do not require it. An invalid cookie leaves the request anonymous.

## Mobile storage

The Expo app uses the same access and refresh secrets. It sends `Authorization: Bearer` and stores the secrets only in Expo SecureStore:

- `ipo-singh.access-token`
- `ipo-singh.refresh-token`

Those names live in `@ipo-singh/contracts` so the app does not invent a second pair. A native client sends `x-ipo-singh-client: ios` or `x-ipo-singh-client: android`. Register, login, and refresh then return those two secrets beside the public account. The website proxy never sends that header, and CORS does not allow a browser to send it, so a website response stays the public account plus the HttpOnly cookies. Bearer requests do not use the CSRF cookie. If a request carries both the access cookie and a bearer token, the cookie wins and the CSRF check applies, so a bearer header cannot skip the cookie check. Refresh without a cookie accepts the refresh secret only when the native header is present. Reuse of a rotated refresh secret still revokes that session.

## CSRF

Unsafe methods are `POST`, `PUT`, `PATCH`, and `DELETE`. The check runs only when the request is already authenticated with the access cookie. The site reads `ipo_singh_csrf` and sends that value as `x-csrf-token`. The hash of the header must match the session. A missing or different header is `403` `forbidden`.

Anonymous mutations stay anonymous. `POST /api/v1/health` without a cookie still reaches the existing body guard.

## Request context

`createAuthMiddleware` runs after the rate limiter and before the routers.

| Presented credential | Account store | Result |
| --- | --- | --- |
| None | Any | `auth.kind` is `anonymous`. Public routes continue. |
| Present and valid | Available | `auth.kind` is `user`, with user, session, device, role, client, and transport. |
| Present and unknown or expired | Available | Anonymous, `authFailure` `invalid`. Public routes continue. |
| Present | Missing, or the query throws | Anonymous, `authFailure` `unavailable`. Public routes continue. |

The middleware does not ping MongoDB. It uses the account store only when a credential is present and the database handle has one. `requireAccount` returns `401` `unauthenticated` for an anonymous or invalid context, and `503` `unavailable` when lookup failed. The watchlist, notification, profile, preference, session, password, and logout routes call it. Public IPO routes do not.

`GET /api/v1/auth` is still unmatched, so it returns `404`. The mounted routes are the ones named above.

## Rate limits

`/api/v1/auth` and paths under it use a separate bucket, `RATE_LIMIT_AUTH`. The default is 10 requests per 60-second window. It cannot be configured above the catalogue limit. Health and readiness stay exempt. A limited auth path still returns `404` until the limit is crossed, and then `429` `rate_limited`.

## Public browsing

Mainboard, SME, detail, calendar, search, and the other IPO reads do not call `requireAccount`. A visitor with no cookie browses the stored catalogue exactly as before. Account-specific payloads use `publicAccountSchema`, `publicDeviceSchema`, `publicSessionSchema`, and `accountSessionResponseSchema`.

## Password sign-in

Registration and login use the same user, device, and session records.

- Email is trimmed and lowercased. The unique index rejects a second account for that address. Closing an account does not free the email.
- A new password is 12 to 128 characters and includes a letter and a number. It must not contain the email name. The API stores Argon2id (19 MiB, 2 passes, 1 lane) and a random salt. The encoded hash is `passwordHash`. The password is not written to logs or to the JSON body.
- Login returns `401` `Email or password is incorrect.` for an unknown email, a wrong password, and a suspended or closed account. A hash still runs when the account cannot be checked.
- Five failed attempts for the same address from the same client return `429` for 15 minutes. `/api/v1/auth/*` also uses the `RATE_LIMIT_AUTH` bucket, default 10 requests per window.
- A duplicate registration returns `400` `Check the email and password and try again.` It does not say that the email is already registered.
- Success sets the three cookies from the cookie table. A website JSON body is the public account. Raw tokens are not in that JSON.
- An `ios` or `android` client with `x-ipo-singh-client` receives the same opaque access and refresh secrets in `mobileSessionGrantSchema`, and the device is recorded as that client. The CSRF secret stays out of the JSON. Web cookie flags are unchanged.
- `POST /api/v1/auth/refresh` rotates the refresh secret. A browser refresh uses the refresh cookie and returns the public account. A native refresh sends the refresh secret in the body. Reuse of the previous refresh secret revokes that session.
- `POST /api/v1/auth/logout` revokes the current session. `POST /api/v1/auth/logout-all` revokes every session for that user. Cookie clients also send `x-csrf-token`. A bearer client does not.
- A session whose refresh lifetime has ended is marked `expired` and kept. It cannot be refreshed.
- Audit lines use the event name, an outcome, and the user id when one exists. They do not include the password, cookie, or token.
- The website calls same-origin `/api/auth/*`. That route forwards cookies to the API and rewrites the refresh cookie path to `/api/auth`. The browser does not store access or refresh tokens in `localStorage`.

## Profile and preferences

A signed-in user reads and changes only the account id on the access session. The request body cannot name another user.

- `PATCH /api/v1/auth/profile` sets `displayName` (1–80 characters, or null). Email stays as stored. A verification message is not sent.
- `POST /api/v1/auth/password` checks the current password, stores a new Argon2id hash, and revokes every other session. The current session stays signed in. The JSON response is the public account. It has no password hash and no session secret.
- `POST /api/v1/auth/sessions/revoke` ends one other session owned by that user. The current session returns `400`. A session id that is missing or belongs to someone else returns `404`.
- `PATCH /api/v1/auth/preferences` stores the default board, color scheme, alert switch, notification categories, watchlist display, and the mobile-push choice (`off` or `when-available`). The time zone stays `Asia/Kolkata`. Email is not sent. A phone token is not part of this object.
- `PATCH /api/v1/notifications/preferences` updates the same alert switch and categories, including schedule changes and announcements. It does not accept an email address, phone number, or push token.
- Cookie mutations still require `x-csrf-token`. A guest with no cookie keeps the theme in `localStorage` under `ipo-singh-theme`. After sign-in, a page load applies the saved color scheme locally. The header theme control writes it back only when the CSRF cookie is present.

## In-app notifications

Notifications are for the signed-in user id. The website uses the cookie and CSRF rules through `/api/notifications`. A mobile client uses the bearer header. Email and SMS are not sent. A phone reminder is attempted only for a registered device when the account opted in.

A notice is created when that user has saved the IPO, the matching category is on, and the catalogue row is fresh. Opening, closing soon, allotment, and listing use a stored date. A GMP notice needs two fresh rupee readings that differ by at least the configured rupee threshold, and the text says it is not a recommendation. A subscription notice uses a stored total of at least 1, 2, 5, or 10 times. A schedule notice needs an earlier stored schedule that differs. Missing and stale values do not create a notice. Announcements are explicit server messages, not market guesses. Rows expire after 30 days, and a duplicate key cannot insert the same event twice.

The sync worker evaluates those stored facts after each synchronization pass. It reads one watchlist page, one catalogue, and one observation query for the saved IPO ids. It does not call IPO Guru for each user. A lock keeps two workers from evaluating the same page together. A failed attempt is retried, and the page cursor stays put until the page succeeds. Restarting the worker continues from that cursor. The same event key inserts only once. The same tick can then send eligible rows to Expo push. A row is sent once, retried up to the alert attempt limit, and an invalid token is retired. Email and SMS are not sent.

## Watchlist

`GET /api/v1/watchlist` returns the signed-in user rows joined to the public listings cache. `POST /api/v1/watchlist` saves `{ ipoId, note? }`. A second save of the same IPO updates the note only and keeps the original date. `DELETE /api/v1/watchlist/:ipoId` removes that user row. `GET /api/v1/watchlist/:ipoId` reports whether that user saved it. Another user sees `saved: false` and cannot delete the row. The website uses the same cookie and CSRF rules through `/api/watchlist`. A mobile client uses the bearer header on these routes and does not need a second user model. There is no watchlist polling job.

## Email delivery is not configured

IPO Singh does not send email. These flows are absent, and the pages say so:

- No verification message is sent after registration. The account is active immediately, and the email stays unverified.
- No password-reset message is sent. A forgotten password cannot be recovered from the website.

Development testing uses a local API and a password you keep in a password manager. Do not put that password in the repository, a fixture committed to git, or `localStorage`.

Register against a development API with an email you control and a password that stays in your password manager. The cookie jar, if you use one, stays on that machine and is not committed. The website forms at `/register`, `/login`, and `/account` call `/api/auth/*` and are the normal browser check. There is no inbox to open and no reset link to follow. Do not point this at a production database.

## Next prerequisites

1. Add an email provider before building verification or password reset. Do not fake those messages.
2. Add the Expo client later, using SecureStore and the bearer header. Do not add a second user model.
3. Keep public IPO routes free of `requireAccount`.
