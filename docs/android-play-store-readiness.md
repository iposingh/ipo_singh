# Android Play Store readiness — Prompt 82

**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Android identity, EAS production AAB profile, signing documentation, permissions, notifications (76A preserved), privacy/data inventory, Play policy checklist, store listing draft, release tracks.\
**Method:** Repository inspection + automated checks. Prompt 81 report consulted; prior claims not assumed.\
**Does not:** create/upload AAB/APK, publish EAS updates, submit to Google Play, change signing keys, silently rename the Android package, enable push kill switches, or deploy backends.

Related: `mobile-release-eas.md`, `mobile-qa-physical-checklist.md`, `notifications-production.md`, `prompt-81-integration-audit.md`, `final-release-readiness.md`.

---

## Verdicts

| Gate | Verdict |
| --- | --- |
| **ANDROID CODE READINESS** | **READY** — identity, AAB profile, versionCode, targetSdk 36, cleartext off in production, origin guards, chart guards, diagnostics hidden in production, automated mobile suite green |
| **GOOGLE PLAY SUBMISSION READINESS** | **BLOCKED** — production HTTPS API/site origins unset in EAS; privacy policy URL not production-hosted yet; physical crash verification pending; Play Console assets/account work incomplete; push delivery intentionally off. **Update (Prompt 85):** in-app/API account deletion is implemented (`POST /api/v1/auth/account/delete`); deletion is no longer a code blocker — see `release-blockers.md` |
| **READY FOR PROMPT 83** | **YES** — Android release preparation documented; remaining work is ops/policy/product (deletion UX, Console, device QA), not unfixed config regressions |

---

## 1. Current Android configuration

| Item | Value |
| --- | --- |
| Display name | **IPO Singh** |
| Expo slug | `ipo-singh` |
| Expo owner / project | `@iposingh/ipo-singh` (per project context) |
| EAS project id | `da0598c3-64c5-4fc6-9bf5-7fb2c0df8741` |
| App version (versionName) | `0.1.0` |
| Android versionCode | `1` (explicit in `app.config.ts`) |
| Runtime version | `policy: "appVersion"` |
| Deep-link scheme | `iposigh://` |
| Notification channel | `ipo-reminders` (“IPO reminders”) |
| Adaptive icon | `assets/adaptive-icon.png` (512×512) + `#F8FAFC` background |
| Icon | `assets/icon.png` (512×512) |
| Splash | `assets/splash-icon.png` (298×298 mark on `#F8FAFC`) |
| Orientation | Portrait |
| UI style | Automatic (light/dark/system) |
| Cleartext HTTP | **development only** (`usesCleartextTraffic: isDevelopment`) |
| Production Android buildType | `app-bundle` (AAB) |
| Preview Android buildType | `apk` (internal) |
| targetSdk / compileSdk / minSdk | **36 / 36 / 24** (pinned via `expo-build-properties`) |
| Expo SDK | 58 |

---

## 2. Application identity findings

| Surface | Current value | Notes |
| --- | --- | --- |
| Preview / development package | `com.iposigh.mobile.dev` | Installed preview APKs upgrade on this id |
| Production package | `com.iposigh.mobile` | Store profile only; **does not** upgrade `.dev` APKs |
| URL scheme | `iposigh` | Historical spelling (missing “n”); do not rename silently |
| Visible branding | IPO Singh | Correct spelling in UI |

### `iposigh` vs `iposingh`

Identifiers containing **`iposigh`** (missing **n**) still exist by design in:

- Android package / iOS bundle ids\
- Custom URL scheme\
- Deep-link examples and tests\

Display strings use **IPO Singh**. Developer contact uses `iposingh.dev@gmail.com`.

### Proposed correction (approval required — **not applied**)

| Proposal | `com.iposingh.mobile` |
| --- | --- |
| Status | **approval-required** |
| Upgrades `com.iposigh.mobile` installs? | **No** |
| Upgrades `com.iposigh.mobile.dev` installs? | **No** |
| Play package availability | **Not verified** (no automated Play Console check; do not claim availability) |

**Recommendation:** Keep `com.iposigh.mobile` for the first production listing unless branding/legal requires the spelling fix **before** first Play upload. If renaming after a production upload, treat as a **new application** (new listing, no upgrade path). Changing preview’s `.dev` id would force testers to uninstall/reinstall — do not do that casually.

**Developer decision needed:** Approve keep `com.iposigh.mobile` **or** approve migrate to `com.iposingh.mobile` before first store upload.

---

## 3. Signing configuration

| Topic | Status |
| --- | --- |
| EAS-managed Android keystore | Assumed present from first preview APK (Expo-managed). **Do not regenerate or download in this prompt.** |
| Upload key vs Play App Signing | Google Play App Signing is required for new Play apps: Play holds the **app signing key**; EAS/upload key signs the AAB you upload. |
| Key preservation | Keep the Expo credentials for this EAS project; losing the upload key blocks updates unless Play recovery procedures apply. |
| Credential recovery | Use Expo dashboard credential recovery / Google Play upload-key reset only with explicit approval. |
| Changes this prompt | **None** to signing material |

Verify in Expo (`eas credentials`) and Play Console before the first production upload — without pasting secrets into git or chat.

---

## 4. Versioning strategy

| Field | Source | Rule |
| --- | --- | --- |
| `version` / versionName | `app.config.ts` (`0.1.0`) + `appVersionName` in identity | Human-readable; bump for meaningful releases |
| `android.versionCode` | Explicit `1` | **Must increase** for every Play upload of the same package |
| EAS `appVersionSource` | `local` | Reads from app config; no silent remote auto-increment |
| Profiles | development / development-device / preview / production | Separate channels; production uses store distribution + AAB |
| OTA (`expo-updates`) | Same `runtimeVersion` = appVersion | JS-only fixes can OTA; native/SDK/permission/versionCode changes need a new binary |

**Future releases:** (1) bump `versionName` as needed, (2) always increment `versionCode`, (3) keep identity constants and `app.config.ts` literals aligned, (4) rebuild AAB for native changes.

This audit **did not** increment beyond `1` unnecessarily.

---

## 5. Android permissions

### Declared in app.config

- `POST_NOTIFICATIONS` (Android 13+)

### Expected from dependencies (merged at prebuild)

| Permission | Source | Needed? |
| --- | --- | --- |
| `INTERNET` | expo-image / platform | Yes — API catalogue |
| `ACCESS_NETWORK_STATE` | expo-image | Yes — connectivity-aware loads |
| `POST_NOTIFICATIONS` | expo-notifications + config | Yes — opt-in reminders |
| `RECEIVE_BOOT_COMPLETED` | expo-notifications | Yes — notification scheduling resilience |

No camera, media library, precise location, contacts, or SMS permissions are declared for IPO Singh features. Photo/media access is **not** required for current banners (remote HTTPS images).

### Runtime behavior

- Notification permission is requested only when the user enables phone reminders.\
- Denial → browsing/watchlist/auth continue; push phase becomes `denied` (no crash).\
- Android channel `ipo-reminders` is created when reminders are enabled / on startup ensure.

---

## 6. Notification readiness (Prompt 76A preserved)

| Rule | Status |
| --- | --- |
| Mainboard → opted-in users without watchlist | Intact (API eligibility + engine tests) |
| SME → watchlist required | Intact |
| Preferences / opt-outs | Intact; defaults off for new board prefs |
| Kill switches | `PUSH_DELIVERY_ENABLED` / `ALLOTMENT_BROADCAST_ENABLED` default **false** |
| Dedup / retry / IST / deep links | Intact in API/mobile code |
| Android channel + Expo token registration | Code-level ready |
| FCM credentials in Expo for production Android push | **Required** before live Android delivery — configure in Expo dashboard |
| Live push / production enablement | **Not performed** (forbidden) |

**Code-level readiness:** yes (with kill switches off).\
**Actual push delivery verification:** not done.

---

## 7. Privacy and data inventory

| Data | Collected / stored? | Where | Notes |
| --- | --- | --- | --- |
| Display name | Optional account | API / Mongo | Profile |
| Email | Account registration | API / Mongo | Required for account |
| Password | Hash only | API / Mongo | Not in mobile storage as plaintext |
| Auth tokens | Yes | Mobile SecureStore; API sessions | Opaque sessions |
| Watchlists | Signed-in | API / Mongo | IPO ids + optional note |
| Device / installation id | Random UUID | SecureStore | Not IMEI/AAID; anonymous push ownership |
| Expo push tokens | Opt-in | SecureStore + API | Deduped server-side |
| Notification preferences | Yes | Account prefs / device gates | Categories + board flags |
| Theme preference | Yes | Device + account | Not sent to IPO Guru |
| Promotion analytics | Aggregate only | API events | Banner id + impression/click; no account/PAN |
| Crash logs | Not productized | None in-app | No Sentry/Crashlytics wired in mobile sources inspected |
| Advertising ID | **Not collected** | — | Explicitly avoided in push install id comments |
| PAN / application numbers | **Not collected** | — | Allotment opens external registrar only |

Website privacy page: `/privacy` (requires deployed `IPO_SINGH_SITE_URL` / `EXPO_PUBLIC_IPO_SINGH_SITE_URL`).\
Mobile opens that URL when configured; otherwise shows summaries.

### Account deletion

| Requirement | Status |
| --- | --- |
| In-app account deletion | **Missing** — registration exists; no member-facing delete/close UI |
| Web deletion resource URL | **Missing** — no dedicated deletion page URL |
| Server `closeUser` helper | Exists in session-service (admin/test use); **not** exposed as a self-service member API in routes inspected |
| Play Console deletion URL field | **Blocker** until product implements + hosts a URL |

Severity: **CRITICAL** for Play submission while account creation remains available.

---

## 8. Google Play policy checklist

| Topic | Status | Notes |
| --- | --- | --- |
| Target API 36 (new apps as of 31 Aug 2026) | **Configured** | Pinned target/compile 36; RN/Expo defaults also 36 |
| Data safety form | **Manual** | Use inventory in §7; do not invent collection |
| Privacy policy URL | **Blocker until hosted** | Site page exists in repo; production HTTPS origin required |
| Account deletion | **Blocker** | See §7 |
| UGC | Likely N/A / limited | No public user posts; watchlist notes are private — confirm in Console questionnaire |
| Financial / investment | Disclose informational only | GMP unofficial/indicative; disclaimer copy on site + Settings note |
| Ads | Managed banners | Disclose paid placements; house slides unlabeled per product rules |
| Notifications consent | Opt-in | OS permission + in-app prefs; kill switch off |
| Content rating | **Manual** | Complete IARC questionnaire in Play Console |
| App access for reviewers | **Manual** | Provide demo account or “browse without login” instructions |
| Store listing assets | **Pending** | See §9 checklist |
| Developer contact | `iposingh.dev@gmail.com` | Also `/contact` on website |
| 16 KB page size / other 2026 native requirements | **Verify on first AAB** | Confirm against current Play pre-launch / official docs after build |

Items marked **Manual** require verification against [Play Console Help](https://support.google.com/googleplay/android-developer) at submission time — do not treat this doc as Google approval.

---

## 9. Store listing draft

**App name:** IPO Singh\

**Short description (≤80 chars):**\
Indian IPO listings, calendars, GMP and subscription snapshots — informational only.

**Full description (draft):**\
IPO Singh helps you follow Indian Mainboard and SME IPOs in one place. Browse open, upcoming, closed, and listed issues; open detail pages with dates, prices, documents when stored, and unofficial grey-market premium (GMP) and subscription snapshots from IPO Singh’s catalogue. Save a watchlist when signed in. Optional reminders respect your preferences: Mainboard alerts can reach opted-in users without a watchlist; SME alerts require that IPO on your watchlist.

IPO Singh does not provide investment advice, does not guarantee GMP accuracy, and does not guarantee allotment results. Allotment status opens the registrar’s official site; IPO Singh never asks for your PAN. Missing figures stay unavailable and are not shown as zero.

**Primary category recommendation:** Finance (or News & Magazines if Finance positioning is declined — confirm in Console).\

**Feature highlights:** Mainboard & SME lists · IPO detail · Calendar/search · Watchlist · Opt-in reminders · Registrar links · Light/dark theme\

**Release notes template:**\
`0.1.0 (1) — First Play track build: catalogue browsing, watchlist, optional reminders (delivery off until enabled server-side), privacy and disclaimer links.`

### Asset checklist (do not invent images here)

| Asset | Requirement | Repo status |
| --- | --- | --- |
| App icon | Play high-res 512+; prefer 1024 source | 512×512 present — consider 1024 export |
| Feature graphic | 1024×500 | **Missing** |
| Phone screenshots | Min 2; recommend Home, IPOs, Detail, Watchlist, Settings | **Not captured** |
| Tablet screenshots | Optional | Optional |
| Privacy policy URL | HTTPS public | **Needs production site** |
| Support email / URL | Required | Email ready; URL when site live |

---

## 10. Release track strategy

1. **Internal testing** — Upload AAB; add license testers; validate install, API HTTPS, detail navigation, charts.\
2. **Closed testing** — Wider testers; exercise auth, watchlist, notification permission denial paths.\
3. **Open testing** (optional) — Broader feedback before production.\
4. **Production** — Staged rollout (e.g. 10% → 50% → 100%); monitor crashes and API errors.

**Prerequisites:** Play Console developer account (fees/identity verification per Google’s current process), app created with package `com.iposigh.mobile` (or approved rename), Play App Signing accepted, AAB signed with EAS upload key, Data safety + deletion URL complete, store listing + content rating done.

**Rollback / incidents:** Halt rollout in Play Console; publish prior AAB if needed; server-side disable push (`PUSH_DELIVERY_ENABLED=false`); OTA only for JS fixes sharing the same runtime version.

**Do not** submit from this prompt.

---

## 11. Testing requirements

### Automated (this prompt)

- Typecheck / ESLint / mobile unit tests\
- Expo config + EAS profile assertions (AAB, APK, channels, no secrets/tunnels)\
- Android JS bundle export\
- Chart / origin / diagnostics production guard tests\

### Physical device (still pending)

- IPO card → detail (prior crash)\
- GMP / subscription charts\
- Back navigation, offline, notification permission deny\
- Deep link `iposigh://ipo/<slug>`\
See `mobile-qa-physical-checklist.md`.

### Native compile

Local Gradle/AAB compile was **not** run (EAS cloud build intentionally not triggered). Treat first `eas build --profile production` as the native compile verification.

---

## 12. Automated test results

| Check | Result |
| --- | --- |
| Mobile typecheck | Pass |
| Mobile lint | Pass |
| Mobile unit tests | **117** pass / 0 fail |
| Production `expo config` | Package `com.iposigh.mobile`, versionCode `1`, EAS project id present |
| Android `expo export` | Pass |
| EAS cloud build / AAB | **Not run** (restricted by prompt) |
| Local Gradle native compile | **Not run** |
| Play Console validation | **Not run** |

---

## 13. Physical-device tests pending

1. Install new APK/AAB with chart + list clipping fixes.\
2. Confirm IPO detail no longer crashes.\
3. Exercise auth, watchlist, settings, registrar external link.\
4. Deny notification permission and confirm browsing still works.

---

## 14. Manual prerequisites

- [ ] Decide production package id (`com.iposigh.mobile` vs approved `com.iposingh.mobile`)\
- [ ] Set EAS production env: `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN`, `EXPO_PUBLIC_IPO_SINGH_SITE_URL` (stable HTTPS)\
- [ ] Confirm Expo Android credentials / FCM for push (before enabling delivery)\
- [ ] Host privacy policy + account deletion web resource\
- [ ] Implement in-app account deletion (or link to web deletion)\
- [ ] Play Console: listing, Data safety, content rating, reviewer access\
- [ ] Capture screenshots + feature graphic\
- [ ] Physical QA sign-off\

---

## 15. Remaining blockers

| ID | Severity | Blocker |
| --- | --- | --- |
| P82-1 | **CRITICAL** | No in-app + web account deletion flow while registration exists |
| P82-2 | **HIGH** | Production HTTPS API/site origins not configured in EAS env (git correctly omits them) |
| P82-3 | **HIGH** | Privacy policy URL not available on a production public HTTPS host yet |
| P82-4 | **HIGH** | Physical Android IPO-detail crash verification still pending |
| P82-5 | **MEDIUM** | Play listing assets (feature graphic, screenshots) missing |
| P82-6 | **MEDIUM** | Package spelling `iposigh` vs proposed `iposingh` — decision required before first upload |
| P82-7 | **MEDIUM** | FCM / Expo push credentials for production Android not verified here |
| P82-8 | **LOW** | High-res 1024 icon / splash polish for store |

---

## Changes implemented in Prompt 82

1. Explicit `android.versionCode = 1` and pinned `minSdk`/`compileSdk`/`targetSdk` **36**.\
2. Documented proposed package rename without applying it.\
3. Versioning / permissions helpers for audits.\
4. Production builds hide developer diagnostics (no public debug menu).\
5. Settings disclaimer note: informational content; GMP unofficial; not investment advice.\
6. This readiness document.

### Files modified

- `apps/mobile/app.config.ts`\
- `apps/mobile/src/preview/identity.ts`\
- `apps/mobile/src/preview/readiness.ts`\
- `apps/mobile/src/preview/readiness.test.ts`\
- `apps/mobile/src/settings/diagnostics.ts`\
- `apps/mobile/src/screens/settings-screen.tsx`\
- `apps/mobile/src/detail/navigation.test.ts`\
- `docs/android-play-store-readiness.md`
