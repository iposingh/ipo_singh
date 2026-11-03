# Final release readiness — Prompt 80

**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** End-to-end audit after Prompts 01–79 and 76A across website, API, workers, MongoDB/Redis, IPO Guru, Expo Android/iOS.\
**Method:** Code and test evidence only. Prior prompt completion was not assumed.\
**Does not:** deploy, publish APK/AAB/IPA, publish EAS updates, send live push, enable kill switches, or change production credentials.

Related: `final-release-candidate.md` (Prompt 85), `release-blockers.md`, `final-manual-testing-checklist.md`, `production-launch-runbook.md`, `production-deployment-readiness.md`, `production-deployment-runbook.md`, `notifications-production.md`, `api-security-production.md`, `mobile-qa-physical-checklist.md`, `mobile-release-eas.md`, `website-seo-launch.md`.

---

## Status legend

| Status | Meaning |
| --- | --- |
| **IMPLEMENTED** | End-to-end path in code + automated tests (or intentional empty/unavailable handling) |
| **PARTIAL** | Real code exists with a known product or wiring gap |
| **MISSING** | No product surface (or schema-only) |
| **BLOCKED** | Depends on secrets, store enrollment, physical device, or live vendor activation |

---

## 1. Feature completion matrix

| Feature | Website | Android | iOS | API / DB / Admin | Status |
| --- | --- | --- | --- | --- | --- |
| Mainboard / SME listings | SSR boards | Tabs / board switcher | Same codebase | Catalogue by `board` field | **IMPLEMENTED** |
| IPO detail (slug) | `/ipos/[slug]` | `/ipo/[slug]` | Same | `GET /api/v1/ipos/:slug` | **IMPLEMENTED** |
| Open / Upcoming / Closed / Listed sections | Home + board pages | Dashboard sections | Same | Status filters + lifecycle | **IMPLEMENTED** |
| Search / filters / calendar / compare | Yes | Yes | Same | Query routes | **IMPLEMENTED** |
| GMP current + history | Detail | Detail + charts | Same | Observations + history sync | **IMPLEMENTED** |
| Subscription current + history | Detail | Detail + charts | Same | Observations + history sync | **IMPLEMENTED** |
| Watchlists (signed-in) | Account watchlist | Watchlist tab | Same | Account-scoped rows | **IMPLEMENTED** |
| Guest watchlist UI | N/A (web account) | Unsupported UI; API device-watchlist for SME anon | Same | Device watchlist API | **PARTIAL** |
| Auth (register/login/session) | Cookie BFF | SecureStore bearer | Same | Opaque sessions + CSRF | **IMPLEMENTED** |
| Settings / preferences | Account prefs | Account prefs | Same | Preference PATCH | **IMPLEMENTED** |
| In-app notifications | Yes | Alerts tab | Same | Inbox + dedupe | **IMPLEMENTED** |
| Push (Expo) | N/A | Registration path | Same | Worker delivery (kill-switched) | **IMPLEMENTED** (delivery **BLOCKED** until approved) |
| Mainboard global alerts (76A) | Prefs surface | Prefs + engine | Same | Engine + eligibility | **IMPLEMENTED** |
| SME watchlist-only alerts (76A) | Prefs | Prefs + engine | Same | Engine + allotment notify | **IMPLEMENTED** |
| Allotment pages / registrar links | Yes | Allotment screen | Same | Verified URLs; no PAN | **IMPLEMENTED** |
| Confirmed allotment verify + notify | Admin + worker | Deep link consume | Same | Adapters + board-scoped queue | **IMPLEMENTED** (broadcast **BLOCKED** off) |
| Advertisements / banners | Carousel | Carousel | Same | Promotions API + media | **IMPLEMENTED** |
| SEO (meta, sitemap, robots, JSON-LD) | Yes | N/A | N/A | — | **IMPLEMENTED** |
| App store promo CTAs | Coming soon until URLs set | — | — | Env store URLs | **PARTIAL** |
| Admin panel | `/admin/*` | N/A | N/A | Role-gated API | **IMPLEMENTED** |
| IPO Guru Pro v2 sync | Via API only | Via API only | Same | Worker + quotas | **IMPLEMENTED** (live key **BLOCKED**) |
| Blog / articles CMS | Seed blog pages | News screens (API/content) | Same | Articles API; web seed not CMS-wired | **PARTIAL** |
| Email / SMS alerts | Explicitly out | Explicitly out | Same | — | **MISSING** (intentional) |
| OFS / unlisted product API | — | — | — | Models/mappers only | **MISSING** |
| `/gmp` `/subscription` hub pages | Placeholder | — | — | — | **PARTIAL** (intentional) |

Shared contracts: `@ipo-singh/contracts` + `@ipo-singh/core` lifecycle (`resolveIpoLifecycle`, allotment Out requires `allotmentConfirmed`).

---

## 2. Website ↔ mobile consistency

| Field | Shared source | Notes |
| --- | --- | --- |
| Names, slugs, dates, prices | IPO Singh API Zod contracts | Both refuse inventing sample companies |
| Board Mainboard/SME | Stored `board` | Never inferred from slug |
| Status / lifecycle | `resolveIpoLifecycle` | Allotment Out needs confirmation flag |
| GMP / subscription | Detail APIs + history | Homepage cards omit GMP/sub (product decision); detail shows missing/zero/stale distinctly |
| Registrar links | Verified allotment URL helpers | No PAN collection |

Legitimate cache/TTL differences may show brief lag between clients; both treat API outage as unavailable, not fabricated data.

---

## 3. IPO lifecycle (Upcoming → Open → Closed → Allotment → Listed)

| Concern | Evidence |
| --- | --- |
| Transitions | `packages/core` lifecycle + catalog present; allotment date alone ≠ Out |
| Homepage sections | Web home + mobile dashboard section filters |
| Detail / freshness | Provenance + cache TTLs; stale labeled |
| Watchlist | Survives status change; joins live catalogue |
| Notifications | Date/GMP/subscription/schedule evaluators; IST calendar |
| Allotment links | Registrar adapters + verified URLs |
| History | GMP/subscription history stores; charts sanitize |

No invented close-of-day clock unless `ALERT_IPO_CLOSE_HOUR_IST` is set.

---

## 4. Final notification audit (Prompt 76A)

| Rule | Result |
| --- | --- |
| Mainboard: no watchlist; prefs required | **Pass** (engine + `board-policy.test.ts`) |
| SME: watchlist required for all categories incl. Allotment Out | **Pass** (`notify.ts` + tests) |
| Opening / closing / listing / schedule / GMP / subscription / allotment | Covered by evaluate + engine + allotment notify |
| Deduplication / retries / IST / tokens / deep links / kill switches | **Pass** (mocked Expo) |
| **Conflict with allotment broadcast?** | **None** — `ALLOTMENT_BROADCAST_ENABLED` queues only; recipient selection still board-scoped. Enabling broadcast cannot bypass SME watchlist |
| Real device delivery | **NOT VERIFIED** — kill switches remain off; no real sends |

Defaults: `PUSH_DELIVERY_ENABLED=false`, `ALLOTMENT_BROADCAST_ENABLED=false`, Mainboard/SME prefs default off for new accounts.

---

## 5. Android crash regression

| Guard | Status |
| --- | --- |
| No Unix-ms `x` on gifted-charts | Automated regression |
| `sanitizePlotPointsForNative` / bar sanitization / point cap | Automated |
| `ChartSafeBoundary` | Automated (source + tests) |
| No nested FlatList in detail charts | Automated |
| `removeClippedSubviews={false}` on lists | Automated |
| Invalid slug / push payload handling | Automated |
| Expo Router `ErrorBoundary` | Present |

**Physical Android verification:** **PENDING** until a **new** preview APK (post–Prompt 78 guards) is installed and IPO cards with GMP history are tapped without crash. Do **not** treat earlier APK tests as proof.

---

## 6. Production build verification (this audit)

| Check | Result |
| --- | --- |
| Workspace typecheck | Pass |
| ESLint (api, web, mobile) | Pass |
| API tests | **280** pass / 0 fail |
| Web tests | **91** pass / 0 fail |
| Mobile tests | **116** pass / 0 fail |
| Contracts / core / design-tokens | **15** / **32** / **2** pass |
| `npm run build -w @ipo-singh/api` | Pass (`dist/index.js`, `dist/worker.js`) |
| `npm run build -w @ipo-singh/web` | Pass (Mainboard/SME/detail/sitemap/robots) |
| `expo export` Android JS bundle | Pass |
| `expo export` iOS JS bundle | Pass |
| `expo-doctor` | **20/20** |
| Native EAS APK/IPA / store submit | **Not run** |
| Live IPO Guru / live push | **Not run** |

No failing tests were skipped or hidden.

---

## 7. Performance and reliability (review)

| Area | Assessment |
| --- | --- |
| DB / Redis | Indexed models; pool/TTL policies; Redis fail-closed locks for workers |
| API / Guru quota | Sync tick caps + minute/day budgets; mock refused in production |
| Mobile charts | Dense series capped for native SVG; tables keep full history |
| Network / offline | Cache + unavailable states; no invented IPOs |
| High-severity code defects found this audit | **None requiring emergency fix** |

Residual: multi-instance rate limits are in-process; Zod major upgrade deferred.

---

## 8. Security and privacy (final)

| Control | Status |
| --- | --- |
| Secrets server-side only | OK |
| Auth / CSRF / roles | OK |
| Admin without session | 401/403 |
| Ops token missing → 404 | OK |
| Env isolation Mongo (dev/test/staging names) | OK |
| Push token ownership | Hardened (Prompt 75) |
| PAN not collected | OK |
| Log redaction | OK |
| Tunnel URL as prod API | Refused for preview/production mobile origins |

Do not print or commit credentials.

---

## 9. Environment requirements (names only)

See `docs/production-deployment-runbook.md` and `apps/api/.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example`.

Minimum for staging soak: `NODE_ENV`, HTTPS `IPO_SINGH_SITE_URL` / `IPO_SINGH_API_ORIGIN`, `MONGODB_URI`, `REDIS_URL` (workers), `CORS_ORIGINS`, kill switches **false**, optional Guru key+budgets.

---

## 10. Device & push checklists

### Android real-device (after new preview APK)

Use `docs/mobile-qa-physical-checklist.md`. Critical: **A7/B1/C2** — open IPO cards with GMP history; no process death. Mark PASS only on rebuilt binary.

### iOS real-device

Same functional checklist on a development/preview build. Store/TestFlight needs Apple Developer + APNs. **NOT VERIFIED** in this audit.

### Push verification

1. Kill switches remain false until approval.\
2. Single test device + Expo token.\
3. Confirm ticket/receipt and deep link.\
4. Never broadcast Allotment Out to all users for a casual test.

---

## 11. Deployment order & rollback

**Order:** secrets → Mongo indexes → Redis → API → health/ready smoke → worker → (optional Guru) → website → mobile rebuild for QA → push only after approval.

**Rollback:** disable `PUSH_DELIVERY_ENABLED` / `ALLOTMENT_BROADCAST_ENABLED` / `ALLOTMENT_VERIFY_ENABLED` / `IPOGURU_ENABLED` first; redeploy prior API/web artifacts; OTA or native rollback for mobile. Details: `production-deployment-runbook.md`.

---

## 12. Known limitations

- Blog on web uses seed articles; not fully wired to CMS admin.\
- Guest mobile watchlist UI still unsupported (API device-watchlist exists for SME anon).\
- App store CTAs empty until store URLs configured.\
- OFS/unlisted not a public product.\
- Email/SMS intentionally absent.\
- Physical push and crash retest pending.\
- Zod 4 migration deferred.

---

## 13. Release blockers (public launch)

1. Production secrets + dedicated Mongo/Redis + TLS edge\
2. Stable HTTPS site + API origins (no Cloudflare quick tunnel)\
3. Worker running with Redis\
4. IPO Guru live activation (when catalogue must be live)\
5. New Android APK + physical crash retest PASS\
6. iOS signing / Apple Developer for device or store\
7. Explicit approval before enabling push or allotment broadcast\
8. Play/App Store listings and store package cutover for production id\

---

## 14. Final verdicts

| Surface | Verdict | Conditions |
| --- | --- | --- |
| **1. Website** | **READY WITH CONDITIONS** | Set `IPO_SINGH_SITE_URL` + HTTPS API; deploy behind TLS |
| **2. Backend** | **READY WITH CONDITIONS** | Prod Mongo/Redis/secrets/worker; Guru when approved; kill switches off |
| **3. Android** | **READY WITH CONDITIONS** | JS export/doctor green; **physical crash retest on new APK pending** |
| **4. iOS** | **READY WITH CONDITIONS** | Same JS app; Apple enrollment/APNs for device/store still external |
| **5. Notifications** | **READY WITH CONDITIONS** | 76A policy tested with mocks; production delivery remains disabled |
| **6. Overall production** | **BLOCKED** for public go-live | Staging **release candidate** acceptable once secrets + HTTPS + worker exist |

Development phase may close as a **verified release candidate**. Launch is not automatic and remains gated by the blockers above.
