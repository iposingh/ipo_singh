# iOS App Store & TestFlight readiness — Prompt 83

**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** iOS identity, EAS profiles, versioning, APNs, privacy/permissions, account deletion, App Store policy checklist, TestFlight plan, listing drafts.\
**Method:** Repository inspection + Prompt 81/82 reports + automated checks. Features not verified in code were not assumed.\
**Does not:** create/upload IPA, submit TestFlight/App Store, create certificates, rename bundle ids silently, enable push delivery, deploy backends, or purchase Apple membership.

Related: `android-play-store-readiness.md`, `mobile-release-eas.md`, `mobile-qa-physical-checklist.md`, `notifications-production.md`, `prompt-81-integration-audit.md`.

---

## Verdicts

| Gate | Verdict |
| --- | --- |
| **iOS CODE READINESS** | **READY** — bundle/buildNumber/deployment target pinned; store vs device EAS profiles correct; production diagnostics hidden; charts/origin guards intact; account close path added; automated suite green |
| **TESTFLIGHT READINESS** | **READY WITH CONDITIONS** — code + EAS production profile ready; needs paid Apple Developer Program, App Store Connect app record, EAS iOS credentials, stable HTTPS API/site env, physical iPhone install of a signed build |
| **APP STORE SUBMISSION READINESS** | **READY WITH CONDITIONS** — account deletion + privacy copy in place; still needs hosted privacy URL, listing assets, ASC privacy answers, physical QA, APNs for live push (delivery remains kill-switched) |
| **READY FOR PROMPT 84** | **YES** |

---

## 1. Current iOS configuration

| Item | Value |
| --- | --- |
| Display name | **IPO Singh** |
| Expo slug | `ipo-singh` |
| EAS project | `@iposingh/ipo-singh` / `da0598c3-64c5-4fc6-9bf5-7fb2c0df8741` |
| Preview / development bundle id | `com.iposigh.mobile.dev` |
| Production bundle id | `com.iposigh.mobile` |
| Version (CFBundleShortVersionString) | `0.1.0` |
| Build number (CFBundleVersion) | `1` |
| URL scheme | `iposigh://` |
| Orientation | Portrait |
| UI style | Automatic |
| Supports tablet | Yes |
| Deployment target | **16.4** (pinned) |
| Notification usage string | Optional IPO reminders; browsing does not require permission |
| Export compliance plist | `ITSAppUsesNonExemptEncryption: false` (HTTPS-only assumption — confirm at submit) |
| Icon / splash | Same assets as Android (512 icon; splash mark 298) |
| Cleartext | N/A on iOS; Android cleartext remains development-only |
| Production diagnostics | Hidden (`diagnosticsAvailable("production") === false`) |

---

## 2. Bundle identifier findings

| Surface | Value |
| --- | --- |
| Historical token | `iposigh` (missing “n”) in bundle ids + scheme |
| Visible branding | IPO Singh |
| Proposed corrected id | `com.iposingh.mobile` — **approval-required**, **not applied** |

**Migration:** Production `com.iposigh.mobile` does **not** upgrade installs of `com.iposigh.mobile.dev`. Renaming to `com.iposingh.mobile` would be a new App Store app relative to either id. App Store Connect availability was **not** verified automatically.

**Developer decision:** Keep `com.iposigh.mobile` for first upload, or approve rename before registration in Apple Developer / ASC.

---

## 3. Signing prerequisites

| Task | Paid Apple Developer? | EAS can manage? | Notes |
| --- | --- | --- | --- |
| Enroll in Apple Developer Program | **Yes** | No | Manual enrollment / payment |
| Create App Store Connect app | Yes | Partial (eas submit after setup) | Bundle id must match |
| Distribution certificate / provisioning | Yes | **Yes** (EAS credentials) | Prefer EAS-managed; do not recreate casually |
| Ad hoc / device UDIDs for internal | Yes | Yes for device builds | Preview/internal distribution |
| Simulator build | No (Xcode/sim) | Yes (`development` profile, simulator: true) | **Cannot install on physical iPhone** |
| Physical iPhone development client | Yes for device signing | Yes (`development-device`) | Requires registered device |
| TestFlight / App Store IPA | Yes | Yes (`production` distribution: store) | Cloud build preferred (local Xcode too old) |
| APNs key for Expo push | Yes | Expo dashboard / credentials | Required before reliable iOS remote push |

**This prompt did not** create credentials, enroll accounts, or start builds.

---

## 4. EAS build profile status

| Profile | iOS | Purpose |
| --- | --- | --- |
| `development` | `simulator: true`, `developmentClient: true` | Metro + simulator only |
| `development-device` | `simulator: false`, `developmentClient: true` | Physical iPhone dev client |
| `preview` | `simulator: false`, `distribution: internal` | Internal device testing (not TestFlight) |
| `production` | `simulator: false`, `distribution: store` | TestFlight / App Store IPA |

Production env: `EXPO_PUBLIC_APP_ENV=production` → package `com.iposigh.mobile`, HTTPS API required, tunnels/localhost refused, diagnostics off.

---

## 5. Versioning strategy

| Field | Source | Rule |
| --- | --- | --- |
| `version` / short version | `0.1.0` | User-visible; bump for meaningful releases |
| `ios.buildNumber` | `"1"` | Must increase for every TestFlight/App Store upload of the same bundle |
| EAS `appVersionSource` | `local` | Reads from app.config |
| Runtime / OTA | `appVersion` policy | Same rules as Android |

Do not bump casually during audits.

---

## 6. APNs readiness

| Item | Status |
| --- | --- |
| expo-notifications + usage description | Present |
| Token registration / rotate / revoke | Code-level |
| Foreground handler / tap / cold start | `push-runtime` |
| Prompt 76A Mainboard global / SME watchlist | Unchanged |
| Kill switches | Default **off** |
| Live push / FCM-APNs credentials verification | **Not performed** |
| Expo production notification mode | Non-development builds use `mode: "production"` |

**Code-level APNs path:** ready. **Delivery verification:** not done (forbidden).

---

## 7. Permissions

| Permission | Declared? | Needed? |
| --- | --- | --- |
| Notifications | Usage description + runtime request on opt-in | Yes for reminders |
| Face ID (SecureStore unlock) | Plugin string | Only if device uses biometrics for Keychain |
| Photo / camera / tracking / location | **Not requested** | Not used |
| Advertising identifier | **Not collected** | — |

Denying notification permission does not block catalogue browsing.

---

## 8. Privacy data inventory

Same inventory as Android readiness (§7): email, password hash, optional display name, sessions, watchlist IPO ids, installation UUID, Expo push tokens, preference flags, aggregate promotion events. No PAN, no AAID, no third-party crash SDK in mobile sources inspected.

---

## 9. Account deletion readiness

| Requirement | Status |
| --- | --- |
| In-app deletion (iOS/Android) | **Implemented** — Settings → Close account (password + confirm) |
| Website deletion | **Implemented** — Account → Close account |
| API | `POST /api/v1/auth/account/delete` with `{ password, confirmation: "DELETE" }` → closes user, clears watchlist, revokes push, revokes sessions |
| Web resource for requests when signed out | Privacy page + `mailto:iposingh.dev@gmail.com` |
| Hosted public privacy URL | **Still needed** for ASC / Play (`EXPO_PUBLIC_IPO_SINGH_SITE_URL` / site deploy) |

---

## 10. App Store policy checklist

| Topic | Status |
| --- | --- |
| Own email/password auth only | **No Sign in with Apple required** under Guideline 4.8 exception (verify at review time) |
| Financial / IPO info | Informational; GMP unofficial/indicative; disclaimer in Settings + site |
| No IAP | No subscriptions/payments in app |
| Account deletion | In-app + web (see §9) |
| Privacy policy URL | Page in repo; production HTTPS host still required |
| Accurate metadata | Draft in §11 — no fabricated ratings/returns |
| External registrar links | Verified HTTPS only; no PAN collection |
| Export compliance | Plist flag set; confirm questionnaire answers |
| Age rating | Manual in ASC |

---

## 11. Store listing drafts

**Name:** IPO Singh\
**Subtitle:** Indian IPO listings & reminders\
**Promotional text:** Follow Mainboard and SME IPOs with calendars, detail pages, and optional reminders.\
**Description:** (align with Android draft — informational catalogue, optional account/watchlist/reminders, GMP unofficial, no investment advice, no PAN.)\
**Keywords:** IPO,SME,GMP,stock,listing,allotment,India,NSE,BSE\
**Primary category:** Finance\
**Support URL / Privacy URL:** Require deployed site paths `/contact` and `/privacy`\
**Review notes:** “Browse without login. Optional account uses email/password only. Demo: create account in-app or use provided credentials. Push delivery may be disabled server-side.”\
**Screenshots:** Capture on physical iPhone after TestFlight — Home, IPOs, Detail, Watchlist, Settings.

---

## 12. TestFlight testing plan

1. Enroll Apple Developer Program; create ASC app with chosen bundle id.\
2. Configure EAS iOS credentials (distribution + APNs if push later).\
3. Set EAS production env HTTPS origins (never tunnels).\
4. `eas build --profile production --platform ios` (manual; not run here).\
5. Upload to TestFlight (EAS submit or Transporter).\
6. Internal testers → install on physical iPhone.\
7. Run `mobile-qa-physical-checklist.md` (detail/charts/auth/deletion/permission deny).\
8. Optional external TestFlight after Beta review.\
9. Collect feedback; increment `buildNumber` for each new upload.

---

## 13. Automated test results

| Check | Result |
| --- | --- |
| Mobile / API / web typecheck + lint | Pass |
| Mobile unit tests | **118** pass |
| Web unit tests | **91** pass |
| API auth + session tests (incl. account delete) | **8** pass |
| Production `expo config` iOS fields | bundle `com.iposigh.mobile`, buildNumber `1` |
| iOS `expo export` | Pass |
| EAS cloud IPA build | **Not run** (restricted) |
| Local Xcode archive | **Not run** (prefer EAS; local Xcode outdated) |

---

## 14. Physical-device testing requirements

- Signed `development-device`, `preview`, or TestFlight build on a real iPhone\
- IPO detail + charts, Safe Area, dark mode, keyboard, external registrar Safari\
- Account close end-to-end against non-production API\
- Notification permission deny path\

Android IPO-detail crash fix remains **Requires physical Android testing** separately.

---

## 15. Manual prerequisites

- [ ] Apple Developer Program membership\
- [ ] Bundle id decision (`com.iposigh.mobile` vs approved rename)\
- [ ] ASC app record + privacy nutrition labels\
- [ ] EAS iOS + APNs credentials\
- [ ] Production HTTPS API/site env vars\
- [ ] Hosted privacy/support URLs\
- [ ] Screenshots / icon polish\
- [ ] TestFlight physical QA\

---

## 16. Remaining blockers

| ID | Severity | Item |
| --- | --- | --- |
| P83-1 | **HIGH** | No paid Apple Developer / ASC setup yet (ops) |
| P83-2 | **HIGH** | Production HTTPS origins unset in EAS |
| P83-3 | **HIGH** | Public privacy/support HTTPS URLs not hosted |
| P83-4 | **HIGH** | Physical iPhone TestFlight verification pending |
| P83-5 | **MEDIUM** | Bundle spelling decision before first ASC registration |
| P83-6 | **MEDIUM** | APNs credentials for live iOS push not verified |
| P83-7 | **LOW** | Store asset capture (screenshots, 1024 icon) |

---

## Changes implemented (Prompt 83)

1. Explicit iOS `buildNumber`, deployment target `16.4`, export-compliance plist flag, clearer notification purpose string.\
2. iOS versioning / EAS device-vs-store readiness helpers + tests.\
3. Member account deletion API + iOS/Android Settings UI + website Account close + privacy deletion instructions.\
4. This document.

### Files modified (primary)

- `apps/mobile/app.config.ts`, `src/preview/identity.ts`, `src/preview/readiness.ts`, `src/preview/readiness.test.ts`\
- `apps/mobile/src/auth/session.ts`, `provider.tsx`, `screens/account-signed-in.tsx`, `settings/legal.ts`\
- `apps/api/src/accounts/profile.ts`, `routes.ts`, `auth-routes.test.ts`, `app.ts`\
- `apps/web/lib/auth/proxy.ts`, `proxy.test.ts`, `features/account/profile-forms.tsx`, `features/auth/account-panel.tsx`, `app/(site)/privacy/page.tsx`\
- `docs/ios-app-store-readiness.md`
