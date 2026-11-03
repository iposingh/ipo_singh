# Accounts, alerts, and admin readiness

Verification of the account, watchlist, in-app notification, alert, admin, and banner work. Public IPO pages stay available without a sign-in. This pass did not call IPO Guru and did not add email, Expo, billing, or push delivery.

## Implemented features

### Authentication

- Registration stores a `member`. It does not reveal whether an email is already used.
- Login, logout, and logout of every device.
- Opaque access and refresh secrets, stored as SHA-256 hashes. Access lasts 15 minutes. Refresh lasts 30 days and rotates. Reuse of a rotated refresh secret revokes the session.
- A person can revoke another of their own sessions. Ending the current session is logout.
- Passwords are 12 to 128 characters, with a letter and a number, and must not contain the email name. The hash is Argon2id. A change revokes the other sessions.
- Five failed logins from the same client lock that attempt for 15 minutes. The failure text is always “Email or password is incorrect.”
- Roles are `member`, `admin`, and `super-admin`. Registration cannot create an administrator. The first super admin comes from startup environment variables. The last super admin cannot be demoted, and nobody changes their own role. A role change or an operator revocation requires the caller’s current password.

### Account and alerts

- Profile updates the display name only. Email cannot be changed here.
- Preferences store the default board (`mainboard`, `sme`, or none), color scheme, in-app alert categories, watchlist display, and the mobile-push choice. The time zone is Asia/Kolkata. Preferences do not store an email, a phone number, or a push token.
- The watchlist stores an IPO id, the date added, and an optional note. Current details are read from the catalogue. One person cannot read or delete another person’s row.
- The notification center lists in-app notices, unread count, and mark-read. Delivery starts as `{ inApp: "delivered", push: "not-sent" }` and can become `sent`, `failed`, or `skipped`.
- The alert worker evaluates stored catalogue data after sync. It does not call IPO Guru per person. A notice is created only for a saved IPO whose category is on and whose stored data is fresh. GMP needs two fresh rupee readings that differ by the configured threshold and says it is not a recommendation. Missing and stale values do not notify. The same event is not inserted twice. Rows expire after 30 days. A failed page is retried without moving the cursor, and stored alerts still run when a sync pass fails. Eligible notices can then be sent to a registered phone.

### Administration

- `/admin` is outside the public site shell. A member is denied. A signed-out visitor is sent to administrator sign-in.
- The dashboard shows catalogue counts, sync, cache freshness, quota, account counts, and warnings. Counts are absent when the store is absent and zero when the store is connected and empty.
- Sync history is readable by an administrator. A super admin can start one catalogue sync after the current password. Production, a missing provider, and an exhausted or unknown quota refuse that start.
- Banners can be drafted, uploaded, scheduled in Asia/Kolkata, previewed, reordered, activated, archived, and deleted. The public home carousel uses managed slides only while at least one banner is visible. An empty managed collection returns the built-in slides. A failed public fetch also returns the built-in slides.
- Audit actions include access denied, role change, session revoke, provider read, bootstrap, manual sync, and banner change. The provider view stays redacted.

## API endpoints

Contracts live in `@ipo-singh/contracts`. The website proxies these paths and does not call the API origin from the browser. A future app calls the API origin directly.

### Auth — `/api/v1/auth`

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/register` | Anonymous. Sets cookies. |
| POST | `/login` | Anonymous. Sets cookies. |
| POST | `/refresh` | Refresh cookie. Rotates cookies. |
| POST | `/logout` | Account. Clears cookies. |
| POST | `/logout-all` | Account. Revokes every session. |
| GET | `/session` | Account. |
| PATCH | `/profile` | Account. |
| PATCH | `/preferences` | Account. |
| POST | `/password` | Account. |
| POST | `/sessions/revoke` | Account. |

`GET /api/v1/auth` is unmatched and returns 404.

### Watchlist — `/api/v1/watchlist`

`GET /`, `GET /:ipoId`, `POST /`, `DELETE /:ipoId`. All require an account. The list joins saved ids to the public catalogue.

### Notifications — `/api/v1/notifications`

`GET /unread-count`, `GET /`, `POST /read-all`, `POST /:id/read`, `PATCH /preferences`. All require an account.

### Admin — `/api/v1/admin`

| Method | Path | Role |
| --- | --- | --- |
| GET | `/session`, `/dashboard`, `/ipos`, `/sync` | Admin or super admin |
| GET | `/provider`, `/audit` | Super admin |
| POST | `/roles`, `/sessions/revoke`, `/sync` | Super admin, with the current password |
| GET, POST | `/banners` | Admin or super admin |
| POST | `/banners/reorder` | Admin or super admin |
| GET | `/banners/media/:id` | Admin or super admin |
| GET, PATCH, DELETE | `/banners/:id` | Admin or super admin |
| POST | `/banners/:id/activate`, `/deactivate`, `/archive` | Admin or super admin |
| POST | `/banners/:id/images?slot=desktop\|mobile` | Admin or super admin. Raw image body. |

### Public promotions — `/api/v1/promotions`

`GET /` and `GET /media/:id`. No account.

Catalogue, search, health, and readiness stay public. `/internal` stays behind `OPS_TOKEN`.

## Authentication architecture

One account record serves the website and a future Expo app. There is no second user table and no JWT.

The website uses three cookies: `ipo_singh_access` (HttpOnly, Lax), `ipo_singh_refresh` (HttpOnly, Strict, path `/api/v1/auth`, rewritten by the website proxy), and `ipo_singh_csrf` (readable, Lax). `Secure` is set in production. Cookie mutations send `x-csrf-token`. Access and refresh cookies are not written to `localStorage`.

Any client may send `Authorization: Bearer` with the same access secret. Bearer requests do not use CSRF. If a cookie and a bearer token are both present, the cookie is used and CSRF applies.

Session authority is MongoDB (`account_users`, `account_devices`, `account_sessions`). Redis is the cache and quota store, not the session store. Expiry is checked in application code.

`requireAccount` protects watchlist, notification, profile, preference, session, password, and logout routes. It returns `401` `unauthenticated` or `503` `unavailable`. Public IPO routes do not call it.

The full design is in `docs/auth-architecture.md`.

## Mobile integration prerequisites

Reviewed against the user-facing routes above.

1. Request and response bodies use the shared Zod contracts. `@ipo-singh/contracts` and `@ipo-singh/core` do not read `window`, `document`, or `localStorage`.
2. Watchlist and notification routes accept the bearer access secret, so they are not limited to a browser session.
3. Watchlist rows are stored by user id. A second device signed in to the same account reads the same rows.
4. Notification list, unread count, and alert preferences use the same account and the same bearer check.
5. Secure storage keys are `ipo-singh.access-token` and `ipo-singh.refresh-token` (`mobileSecureStoreKeys`). The app must keep those values in Expo SecureStore, not AsyncStorage or web storage.
6. Register, login, and refresh keep the website on HttpOnly cookies. The JSON for a browser is the public account. An `ios` or `android` request with `x-ipo-singh-client` receives the same opaque access and refresh secrets in the JSON and stores them in SecureStore. The website proxy does not send that header. There is no second user table and no second token format.
7. Phone reminders use Expo push. `POST` and `DELETE /api/v1/notifications/push-tokens` register and revoke a token for the signed-in iOS or Android device. `when-available`, the alert switch, and the category must all be on. The public delivery state is `not-sent`, `sent`, `failed`, or `skipped`. Email and SMS are not sent. A physical device check has not confirmed delivery.
8. The app should call `/api/v1` on the API origin. It should not depend on the Next.js `/api/auth`, `/api/watchlist`, or `/api/notifications` proxies.

## Test results

Commands were run on 25 October 2026. The IPO Guru connectivity test is skipped and was not executed against the live provider.

| Check | Result |
| --- | --- |
| API unit and integration tests | 201 passed. The IPO Guru connectivity test printed as skipped. The reporter total stayed at skipped 0. |
| Website tests | 74 passed |
| Contract tests | 14 passed |
| Core tests | 19 passed |
| Design-token tests | 2 passed |
| API lint and typecheck | Passed |
| Website lint and typecheck | Passed |
| Contracts, core, and design-token typecheck | Passed |
| API production build | Passed |
| Website production build | Passed, 45 pages |

Authorization, refresh, revocation, password policy, alert deduplication, freshness, worker retry, and quota protection are covered by the API suites, including `auth-routes`, `admin-routes`, `admin-dashboard`, `watchlist`, `notifications`, `engine`, and quota tests.

Browser check on a temporary memory-store preview (ports 4018 and 3035, then stopped):

- Registration created a member and opened the account page with the display name and one web session.
- Saving the default board as SME persisted. After logout and a new login, the SME choice was still selected.
- The notification center showed an empty inbox and the in-app alert settings. At that check, the page stated that email, SMS, and mobile push were not sent.
- Logout cleared the readable CSRF cookie. `localStorage` kept only `ipo-singh-theme`.
- A member opening `/admin` saw “Access denied”.
- The bootstrap super admin reached Overview, Sync, Banners, and Audit. The audit listed Bootstrap succeeded and the member’s Access denied, with Asia/Kolkata times.
- With no banners stored, the public home page kept the built-in promotion carousel and empty catalogue sections.
- At a 390px width the admin links (Overview, Banners, Sync, Audit, Sign out) remained available.

The preview had no catalogue persistence store, so catalogue metrics and sync history showed Unavailable, and the watchlist page reported that saved issues could not be loaded. That matches the API: a missing catalogue store is `503`, not an empty invented list. The watchlist tests cover a real store, including another user’s denial and bearer access. Redis was not configured, and the dashboard said so. The manual sync control stayed disabled until a current password is entered.

## Known issues

- Email verification and password reset are not implemented. The product does not pretend that a message was sent.
- Mobile clients cannot yet complete sign-in, because register, login, and refresh only issue cookies. Bearer access works after a secret exists.
- Login records every new device as `web`.
- An empty banner schedule is shown as Unavailable by the shared date component.
- A website production build warns about `metadataBase` when `IPO_SINGH_SITE_URL` is unset. This verification build set a local preview URL, so that warning was absent. Do not hardcode a domain.
- The default admin rate limit is 10 requests per window. A long browser session can hit it. The product default was not raised.

## Missing production configuration

Set these on the server. Do not put IPO Guru credentials, the bootstrap password, or `OPS_TOKEN` in the website or a mobile app.

- `MONGODB_URI` for accounts, sessions, watchlists, notifications, audit, banners, and the catalogue. Use a database other than `ipo-singh-test`.
- Redis for the shared cache, locks, and provider quota.
- `IPO_SINGH_BOOTSTRAP_ADMIN_EMAIL` and `IPO_SINGH_BOOTSTRAP_ADMIN_PASSWORD` for the first super admin only. Both must be set together, and only at startup.
- `IPO_SINGH_SITE_URL` for canonical URLs and metadata.
- `CORS_ORIGINS` for each browser origin. A future app using bearer does not rely on cookies, but the website does.
- `IPO_SINGH_API_ORIGIN` on the website process, pointed at this API and not at IPO Guru.
- IPO Guru API v2 credentials on the API process only.
- `OPS_TOKEN` if `/internal` status is used.
- `NODE_ENV=production` so auth cookies are `Secure`.
- An email provider, before verification or password reset.
- `EXPO_PUSH_ACCESS_TOKEN` on the API, an EAS project id, and Apple or Firebase push credentials before a development build can deliver a phone reminder.

## Next prerequisites

- Add an email provider before account verification or password reset.
- The Expo app in `apps/mobile` has Mainboard and SME listings, an IPO detail page with Overview, GMP, Subscription, Financials, Allotment, Listing, and Documents, GMP and subscription history charts, a month calendar, search, comparison of 2 to 4 IPOs, registration, login, logout, profile, password change, session refresh, session revocation, the account watchlist, account preferences, and the in-app notification list. Access and refresh secrets stay in Expo SecureStore. The watchlist and preferences use the same account as the website.
- Keep public IPO routes free of `requireAccount`.
- Confirm a phone reminder on a physical iPhone or Android development build. The worker can attempt Expo delivery, and that attempt has not been confirmed on a device.
