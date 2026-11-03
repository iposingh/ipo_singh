# Release blockers — master issue register (Prompt 85)

**Date:** 3 November 2026 (Asia/Kolkata)\
**Method:** Deduplicated from `final-release-readiness.md`, `prompt-81-integration-audit.md`, `android-play-store-readiness.md`, `ios-app-store-readiness.md`, `production-deployment-readiness.md`, plus live repository inspection.\
**Evidence rule:** Issues are not marked resolved without code or automated-test evidence cited below.

Severity: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW**.

---

## Open blockers

| ID | Severity | Area | Issue | Evidence / next action |
| --- | --- | --- | --- | --- |
| RB-01 | CRITICAL | Infra | No authorized production hosts, Atlas, or Redis | Prompt 84; provision per `production-deployment-readiness.md` |
| RB-02 | CRITICAL | Infra | Domain not confirmed owned/configured (`iposingh.com` examples only) | Do not invent DNS; register then set site/API origins |
| RB-03 | HIGH | Infra | Staging HTTPS API missing; tunnels refused for preview/production | Build stable staging API; never bake `*.trycloudflare.com` into EAS/web prod |
| RB-04 | HIGH | Secrets | Production/staging secrets not issued in a secret manager | Mongo, Redis, Guru key, `OPS_TOKEN`, Expo push token, bootstrap admin |
| RB-05 | HIGH | Data | IPO Guru production key + budgets not activated | Set `IPOGURU_*` to purchased plan; keep staging from double-consuming |
| RB-06 | HIGH | Mobile | Android IPO-detail crash **not** re-verified on a **new** preview APK | Code guards present (`sanitizePlotPointsForNative`, `safeChartSpacing`, `ChartSafeBoundary`); physical PASS required |
| RB-07 | HIGH | Mobile | iOS physical-device / TestFlight build not installed | Needs Apple Developer + signed `preview`/`development-device` build |
| RB-08 | HIGH | Store | Play / App Store Console listing assets, privacy answers, enrollment incomplete | See Android/iOS readiness docs |
| RB-09 | MEDIUM | Notify | Production push delivery intentionally disabled | Keep `PUSH_DELIVERY_ENABLED=false` until controlled staging device proof + approval |
| RB-10 | MEDIUM | Notify | Allotment broadcast / registrar verify disabled | `ALLOTMENT_BROADCAST_ENABLED` / `ALLOTMENT_VERIFY_ENABLED` remain false |
| RB-11 | MEDIUM | Security | Zod &lt; 4.6.6 GHSA (memory exhaustion on oversized collections); node-forge transitive highs via Expo tooling | Mitigated by body-size limits + generic errors; **no force Zod 4** this prompt (breaking). Track upgrade |
| RB-12 | MEDIUM | API | In-process rate limits only | Edge/WAF or shared store before multi-instance scale |
| RB-13 | MEDIUM | Git | Working tree largely uncommitted; HEAD predates monorepo product code | Cannot tag reproducible RC until deliberate commit; see `final-release-candidate.md` |
| RB-14 | LOW | Product | Guest mobile watchlist UI unsupported (API device-watchlist exists for SME anon) | Intentional split; document in store copy if needed |
| RB-15 | LOW | Product | Web blog seed not full CMS; GMP/subscription hub pages placeholder; OFS/unlisted not public product | Documented limitations |
| RB-16 | LOW | Identity | Package/scheme spelling `iposigh` vs brand `IPO Singh` | Keep for first upload unless rename approved before store registration |
| RB-17 | LOW | Cost | Exact vendor list prices require verification at purchase | Prompt 84 cost model |

---

## Resolved in code (with evidence) — do not re-open without new failures

| ID | Was | Resolution evidence |
| --- | --- | --- |
| P81-1 | Web prod API origin → localhost / tunnels | `apps/web/lib/api/ipo-singh.ts` + tests refuse tunnels/loopback in production |
| P81-2 | Web `siteUrl` accepted tunnels in production | `apps/web/lib/seo/site.ts` + tests |
| P81-3 | Chart spacing NaN path | `safeChartSpacing` + mobile navigation/series tests |
| P82-DEL | Android Play: account deletion missing | **Superseded:** API `POST /api/v1/auth/account/delete`, web delete-account proxy, mobile `deleteAccount` UI; covered by auth tests + RC invariants test |
| P84-ENV | Staging/prod Mongo/Redis collision risk | `IPO_SINGH_DEPLOYMENT`, `assertSafeDatabase`, cache keys `ipo-singh:{env}:…`, worker Redis requirement |
| P76A | Audience rules | Engine + `board-policy.test.ts` + allotment notify board gate; no conflict with allotment broadcast |

---

## Policy notes (not silent product changes)

1. **76A vs allotment broadcast:** Enabling `ALLOTMENT_BROADCAST_ENABLED` queues confirmed allotment notices but **cannot** bypass SME watchlist / Mainboard global scopes. No conflict found.
2. **Close-hour reminders:** Only when `ALERT_IPO_CLOSE_HOUR_IST` is set; no invented closing times.
3. **Homepage cards:** GMP/subscription detail stays on IPO detail pages (product decision).

---

## Classification for launch gates

| Gate | Blocking IDs |
| --- | --- |
| Comprehensive manual testing (staging) | RB-03, RB-04 (staging secrets), RB-06/07 for mobile device passes |
| Production launch | RB-01–05, RB-08–10, RB-13 (clean tag), then RB-06/07 PASS |
| Production notifications | RB-09, RB-10 after staging push proof |
