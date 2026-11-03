# Final manual testing checklist — after Prompt 85

**Audience:** Developer / QA executing comprehensive testing **after** development freeze.\
**Prerequisites:** Stable **staging** HTTPS API + website (no Cloudflare quick tunnel); fresh Android preview APK; signed iOS device/TestFlight build; staging Mongo/Redis; kill switches **off** unless a controlled push test is explicitly approved.

Companion: `mobile-qa-physical-checklist.md`, `release-blockers.md`, `final-release-candidate.md`.

Mark each row **PASS** / **FAIL** / **SKIP**. Attach evidence (screenshot, build id, log snippet) in the Evidence column.

---

## 0. Environment gate (must pass first)

| # | Check | PASS/FAIL | Evidence |
| --- | --- | --- | --- |
| E1 | Staging API origin is `https://…` (not localhost, not `*.trycloudflare.com`) | | |
| E2 | Staging website `IPO_SINGH_SITE_URL` https canonical | | |
| E3 | Mobile preview `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` matches staging API | | |
| E4 | `IPO_SINGH_DEPLOYMENT=staging`, Mongo name contains `staging`, Redis isolated | | |
| E5 | `PUSH_DELIVERY_ENABLED=false`, `ALLOTMENT_BROADCAST_ENABLED=false` unless authorized test | | |
| E6 | Fresh Android APK built **after** chart/crash guards (post–Prompt 78/81) | | |
| E7 | iOS signed build for physical device (not simulator-only) | | |

---

## 1. Android physical device

Install fresh **preview** APK (`com.iposigh.mobile.dev`). Build id: ________

| # | Check | PASS/FAIL | Evidence |
| --- | --- | --- | --- |
| A1 | Cold launch to home without crash | | |
| A2 | Mainboard and SME lists scroll; open/upcoming/closed/listed sections | | |
| A3 | Search finds a known IPO; empty/error states sane | | |
| A4 | Open **≥3** IPO detail pages including ones with GMP history | | |
| A5 | **Critical:** GMP chart renders; no process death (prior crash regression) | | |
| A6 | Subscription chart / empty history / single-point history | | |
| A7 | Background → foreground; deep link `iposigh://ipo/{slug}` | | |
| A8 | Register / login / logout / session restore | | |
| A9 | Watchlist add/remove; ownership persists after restart | | |
| A10 | Notification prefs toggle; system permission dialog (do not require grant for browse) | | |
| A11 | External registrar link opens browser; **no PAN** collected in-app | | |
| A12 | Ads carousel; offline banner / network error copy | | |
| A13 | Account delete (staging only) with password confirmation | | |
| A14 | 15-minute soak: navigate lists/details without ANR/OOM | | |

---

## 2. iOS physical device / TestFlight

Build id / TestFlight build: ________

| # | Check | PASS/FAIL | Evidence |
| --- | --- | --- | --- |
| I1 | Install on iPhone; launch without crash | | |
| I2 | Safe areas / notch / home indicator; back gesture | | |
| I3 | Repeat A2–A12 functional parity | | |
| I4 | Notification permission string accurate; deny still allows browsing | | |
| I5 | Deep links; charts with history | | |
| I6 | Account delete path visible and works on staging | | |
| I7 | (Optional authorized) APNs delivery — see §5 | | |

---

## 3. Website (desktop + mobile browser)

Staging site URL: ________

| # | Check | PASS/FAIL | Evidence |
| --- | --- | --- | --- |
| W1 | Home, Mainboard, SME, listed, calendar, compare, allotment, search | | |
| W2 | IPO detail: dates IST, GMP, subscription, freshness labels, missing≠zero | | |
| W3 | SEO: title/description, canonical, sitemap.xml, robots.txt sample | | |
| W4 | Auth register/login/logout/CSRF; watchlist; notifications inbox | | |
| W5 | Light / dark / system theme | | |
| W6 | Ads + app download promo (coming soon if store URLs empty) | | |
| W7 | Registrar external links; privacy/terms/account delete | | |
| W8 | API down / 404 slug → unavailable, no invented company | | |
| W9 | Lighthouse or subjective performance on mid-tier mobile | | |
| W10 | Admin (staging admin only): dashboard gated; no anon write | | |

---

## 4. Backend / workers (staging)

| # | Check | PASS/FAIL | Evidence |
| --- | --- | --- | --- |
| B1 | `GET /api/v1/health` ok | | |
| B2 | `GET /api/v1/ready` database ok; Redis status observed | | |
| B3 | Auth rate limit / invalid login does not leak secrets | | |
| B4 | Catalogue/detail match website and mobile for same slug | | |
| B5 | Worker running; sync tick acquires Redis lock; no duplicate catalogue storm | | |
| B6 | IPO Guru (if enabled): quota counters rise within budget; failures logged | | |
| B7 | Ops status with `OPS_TOKEN`; without token stays dark | | |
| B8 | Admin routes 401 without session | | |

---

## 5. Notifications (authorized tests only)

**Do not broadcast to all users.** Use one staging account + one device.

| # | Check | Authorization | PASS/FAIL | Evidence |
| --- | --- | --- | --- | --- |
| N1 | In-app notices for Mainboard opt-in without watchlist | Prefs only | | |
| N2 | SME notice only when watchlisted | Prefs + watchlist | | |
| N3 | Opt-out / category off suppresses | | | |
| N4 | Enable `PUSH_DELIVERY_ENABLED=true` on **staging only** after written approval | Required | | |
| N5 | Single Expo push ticket + receipt; deep link opens detail | Required | | |
| N6 | Invalid token cleanup path (revoke token; confirm no repeated failures) | Required | | |
| N7 | Disable push immediately after test (`PUSH_DELIVERY_ENABLED=false`) | Required | | |
| N8 | Allotment broadcast remains **false** unless separate approval | | | |

---

## 6. Sign-off

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| Android device QA | | | |
| iOS device QA | | | |
| Website QA | | | |
| Backend/worker QA | | | |
| Notification test owner | | | |

**Overall manual testing:** PASS / FAIL\

If FAIL, file bugs against `release-blockers.md` IDs or new IDs before production steps in `production-launch-runbook.md`.
