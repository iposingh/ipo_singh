# Prompt 81 — End-to-end integration, stability & regression audit

**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Website, Expo Android/iOS, API, MongoDB, Redis, IPO Guru Pro, workers, auth/watchlists, push (76A), admin, ads, allotment.\
**Method:** Repository inspection + automated verification. Prior prompt claims were not assumed.\
**Does not:** deploy, EAS publish, store submit, real push, kill-switch enablement, production credential or data changes.

Related: `final-release-readiness.md`, `notifications-production.md`, `mobile-qa-physical-checklist.md`, `production-deployment-runbook.md`.

---

## Verdict

**READY FOR PROMPT 82**

Evidence: workspace typecheck and lint clean; web 91, mobile 116, contracts 15, core 32, API 280 tests passed; API + worker bundles built; Next.js production build succeeded with explicit HTTPS origins; Expo Android and iOS Metro exports succeeded. Confirmed integration defects found in this audit were fixed. Remaining gaps are operational / physical-device / go-live items, not unfixed automated regressions.

Production store launch remains separately **BLOCKED** per Prompt 80 (`final-release-readiness.md`) until secrets, stable hosts, kill-switch approval, and physical Android crash confirmation land.

---

## Status legend

| Label | Meaning |
| --- | --- |
| **Verified working** | Covered by code inspection and/or automated tests in this audit |
| **Verified broken** | Confirmed defect (fixed below if listed under Fixes) |
| **Not tested** | No automated or live exercise in this audit |
| **Requires physical-device testing** | Needs a real phone/tablet; not claimed here |

Severity: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW**.

---

## 1. Architecture findings

| Finding | Severity | Status |
| --- | --- | --- |
| Monorepo `apps/{api,web,mobile}` + `packages/{contracts,core,design-tokens}`; shared Zod contracts drive API and clients | — | Verified working |
| Clients call IPO Singh API only; IPO Guru credentials stay server-side; mobile forbids `EXPO_PUBLIC_*` secret keys | — | Verified working |
| Mobile preview/production already refuse localhost and ephemeral tunnels (`resolveApiOrigin`) | — | Verified working |
| **Website** `ipoSinghApiOrigin` previously defaulted to `http://127.0.0.1:4000` even when `NODE_ENV=production`, and did not refuse Cloudflare quick tunnels / ngrok-style hosts | **HIGH** | Verified broken → **fixed** |
| **Website** `siteUrl` accepted loopback / tunnel hosts under production `NODE_ENV` | **MEDIUM** | Verified broken → **fixed** |
| Opaque session cookies / SecureStore bearers (not JWT access tokens) | — | Verified working (docs that say “JWT” are imprecise) |
| Dev / preview / production mobile env isolation via `EXPO_PUBLIC_APP_ENV` + EAS profiles | — | Verified working |
| Kill switches `PUSH_DELIVERY_ENABLED` and `ALLOTMENT_BROADCAST_ENABLED` default **false** | — | Verified working |

Architectural inconsistencies (documented, not silent product changes):

1. Web production SSR must set `IPO_SINGH_API_ORIGIN` and `IPO_SINGH_SITE_URL` to stable HTTPS IPO Singh hosts before a production build; unset/loopback/tunnel values now resolve to `null` (catalogues render unavailable rather than talking to localhost).
2. Temporary Cloudflare tunnels remain a **development/smoke** convenience only; they must not be baked into preview/production mobile or web configs.
3. Guest mobile watchlist UX stays unsupported while API device-watchlist exists for anonymous SME push scope (**PARTIAL**, intentional product split).

---

## 2. Features inspected

| Area | What was checked | Result |
| --- | --- | --- |
| Website routes | Home, Mainboard/SME, listed, calendar, compare, allotment, search, auth, watchlist, notifications, admin, blog, SEO robots/sitemap/JSON-LD, promotions | Verified working (automated + prior route tests); live browser crawl **Not tested** |
| Themes / responsive | Light/dark/system shared tokens; mobile-first layout patterns | Verified working in code/tests; visual QA **Not tested** |
| Mobile startup / listings / detail / search / watchlist / auth / settings / deep links / ads / registrar | Navigation, origin guards, SecureStore allowlist, chart sanitization, `removeClippedSubviews={false}` | Verified working (unit/export); **Requires physical-device testing** for IPO-card → detail crash |
| GMP / subscription charts | No Unix-ms `x`; `sanitizePlotPointsForNative`; `ChartSafeBoundary`; finite frame/spacing | Verified working (tests); device chart render **Requires physical-device testing** |
| IPO Guru sync | Adapter + quota + cache policies; tests use fixtures/mocks | Verified working; live paid calls **Not tested** (intentional) |
| MongoDB / Redis | Connection, indexes (integration suite), cache TTLs, locks | Verified working under unrestricted test run |
| Notifications 76A | Mainboard global vs SME watchlist; prefs default off; allotment board scope; kill switches | Verified working; real Expo delivery **Not tested** (forbidden) |
| Auth / security | Rate limits, CORS headers, admin gates, input validation, secret scrubbing | Verified working (API safeguards suite) |
| Admin / ads / allotment | Admin proxy allowlist; banner media; registrar adapters; broadcast off | Verified working |
| Workers | Sync + alert + allotment paths in bundle build | Verified working (build + unit); live worker against prod **Not tested** |

---

## 3. Bugs discovered

| ID | Severity | Summary |
| --- | --- | --- |
| P81-1 | **HIGH** | Web API origin defaulted to loopback and accepted ephemeral tunnel hosts in production `NODE_ENV` |
| P81-2 | **MEDIUM** | Web `siteUrl` accepted loopback / tunnel canonical origins in production |
| P81-3 | **LOW** | Mobile chart `spacing` used raw arithmetic without a shared finite guard (defense-in-depth after Prompt 78 chart work) |

No CRITICAL defect found in this audit. The previously reported Android IPO-detail crash remains **Requires physical-device testing** (code mitigations present; device confirmation outstanding).

---

## 4. Root causes

| ID | Root cause |
| --- | --- |
| P81-1 | Website origin helper predated mobile’s stricter preview/production tunnel refusal; localhost default was unconditional |
| P81-2 | SEO site origin validator blocked vendor hosts only, not production loopback/tunnels |
| P81-3 | Gifted-charts spacing derived from width/count without a named finite helper; NaN/Infinity width already softened via `safeChartFrameWidth`, but spacing lacked an explicit reject path |

---

## 5. Fixes implemented

1. **`ipoSinghApiOrigin`** — production requires explicit `https` origin; refuses loopback and ephemeral tunnel hosts; no localhost default when `NODE_ENV=production`; rejects credentials/path/query/hash (aligned with mobile).
2. **`siteUrl`** — production refuses loopback and ephemeral tunnel hosts; requires `https`.
3. **`.env.example` (web)** — documents production HTTPS / no-tunnel requirement.
4. **`safeChartSpacing`** — finite spacing helper; history charts use it; regression assertions in navigation tests.
5. **Tests** — catalog-load + SEO origin cases; mobile spacing edge cases.

Allotment broadcast vs Mainboard/SME audience: **no policy conflict**. Allotment confirm notifier already uses `notificationScopeForBoard` (Mainboard global / SME watchlist) and cannot bypass SME watchlist when `ALLOTMENT_BROADCAST_ENABLED=true`.

---

## 6. Files modified

| File | Change |
| --- | --- |
| `apps/web/lib/api/ipo-singh.ts` | Production-safe API origin validation |
| `apps/web/lib/seo/site.ts` | Production-safe site URL validation |
| `apps/web/.env.example` | Origin documentation |
| `apps/web/features/ipos/catalog-load.test.ts` | Origin regression cases |
| `apps/web/lib/seo/seo.test.ts` | Site URL production cases |
| `apps/mobile/src/charts/series.ts` | `safeChartSpacing` |
| `apps/mobile/src/components/history-charts.tsx` | Use `safeChartSpacing` |
| `apps/mobile/src/detail/navigation.test.ts` | Spacing / chart regressions |
| `docs/prompt-81-integration-audit.md` | This report |

---

## 7. Automated test results

| Check | Result |
| --- | --- |
| `npm run typecheck` (all workspaces) | Pass |
| `npm run lint` (all workspaces) | Pass |
| `@ipo-singh/web` tests | **91** pass |
| `@ipo-singh/mobile` tests | **116** pass |
| `@ipo-singh/contracts` tests | **15** pass |
| `@ipo-singh/core` tests | **32** pass |
| `@ipo-singh/api` tests | **280** pass (Mongo memory-server requires non-sandbox host; sandbox cancelled integration suites with exit 48) |
| Focused 76A / production-safety / allotment notify | **19** pass |
| `npm run build -w @ipo-singh/api` | Pass (`dist/index.js`, `dist/worker.js`) |
| Next production build with `IPO_SINGH_SITE_URL` + `IPO_SINGH_API_ORIGIN` HTTPS examples | Pass |
| `expo export --platform android` | Pass |
| `expo export --platform ios` | Pass |

No tests were skipped or weakened to force green results.

---

## 8. Unverified functionality

| Item | Label |
| --- | --- |
| Physical Android IPO card → detail (crash verification) | Requires physical-device testing |
| Physical iOS smoke | Requires physical-device testing |
| Live IPO Guru Pro quota against paid key | Not tested |
| Real Expo push tickets/receipts | Not tested (forbidden this prompt) |
| Production Mongo/Redis failover under load | Not tested |
| Full manual website visual/a11y pass in browsers | Not tested |
| EAS preview/production install against stable HTTPS API | Not tested (no EAS publish) |
| Store listing / Play / App Store enrollment | Not tested |

---

## 9. Remaining blockers (go-live / ops — not Prompt 81 code blockers)

1. Stable production/staging HTTPS API + site hosts (no tunnels).
2. Production secrets and isolated Mongo/Redis databases.
3. Explicit approval before enabling `PUSH_DELIVERY_ENABLED` / `ALLOTMENT_BROADCAST_ENABLED`.
4. Physical confirmation that Android detail navigation no longer crashes.
5. Store URLs / developer accounts if publishing mobile binaries.
6. Live IPO Guru activation only with quota monitoring.

---

## 10. Recommended next steps (Prompt 82+)

1. Physical-device checklist (`mobile-qa-physical-checklist.md`): IPO list → detail, GMP/subscription charts, auth, watchlist, deep link.
2. Point preview/prod env vars at durable HTTPS IPO Singh API (document in EAS secrets; never commit).
3. Staging soak: worker sync once, alert evaluation dry-run with push still disabled.
4. Only after device sign-off + ops checklist: consider release candidate builds (still outside this audit).

---

## Classification summary

| Severity | Count this audit | Disposition |
| --- | --- | --- |
| CRITICAL | 0 | — |
| HIGH | 1 | Fixed (web production API origin) |
| MEDIUM | 1 | Fixed (web production site URL) |
| LOW | 1 | Fixed (chart spacing guard) |

**READY FOR PROMPT 82** — automated integration and regression gate cleared; manual/device and production go-live work remain explicitly tracked above.
