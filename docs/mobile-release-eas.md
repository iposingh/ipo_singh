# Mobile EAS build, environment & release preparation

**Prompt:** 77\
**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Expo / EAS configuration, application identity, API environment separation, EAS Update readiness, Android/iOS release prep.\
**Does not:** create store builds, publish OTA updates, submit apps, enroll Apple Developer / Play accounts, or change production credentials.

---

## 1. Existing configuration findings

| Area | Finding |
| --- | --- |
| Expo SDK | 58 (`expo` ~58.0.19), Expo Router entry, `expo-dev-client` present |
| Display name | **IPO Singh** |
| Historical short id | `iposigh` in URL scheme and package tokens (missing “n”) — kept for installed-preview continuity |
| Dev / preview package | `com.iposigh.mobile.dev` |
| Production package (new) | `com.iposigh.mobile` (store builds only; does **not** upgrade `.dev` APKs) |
| Deep link scheme | `iposigh://` (unchanged) |
| Reminder channel | `ipo-reminders` |
| EAS project id | Present in `app.config.ts` / `extra.eas.projectId` (`da0598c3-…`); override with `EXPO_PUBLIC_EAS_PROJECT_ID` |
| Profiles | `development`, `development-device`, `preview`, `production` with matching channels |
| First Android preview | Used a temporary Cloudflare Tunnel — must **not** become preview/production API origin |
| `expo-updates` | Was missing; now installed and wired for channels + `runtimeVersion.policy = appVersion` |
| Icons | 512×512 icon / adaptive icon; splash mark smaller — store may still want 1024×1024 source |
| Notification rules | Prompt 76A Mainboard-global / SME-watchlist policy unchanged in this prompt |

---

## 2. Changes implemented

- Environment-specific application id: preview keeps `com.iposigh.mobile.dev`; production uses `com.iposigh.mobile`.
- Reject ephemeral tunnel hosts (`*.trycloudflare.com`, ngrok, loca.lt, …) for **preview** and **production** API origins.
- Install and configure `expo-updates` with EAS Update URL, `ON_LOAD` check, and `appVersion` runtime policy.
- Align `expo-build-properties` to the SDK 58 line (`~58.0.12`) and refresh Expo package patch versions via `expo install --fix`.
- Explicit production Android `app-bundle` (AAB) and non-simulator iOS settings in `eas.json`.
- Preview/readiness helpers and tests for identity, channels, OTA vs native rebuild boundary.
- `.env.example` and this guide document environment separation.

---

## 3. Application identity and migration

| Surface | Value |
| --- | --- |
| App display name | IPO Singh |
| Expo slug | `ipo-singh` |
| URL scheme | `iposigh` (historical; do not rename silently) |
| Android notification channel | `ipo-reminders` |
| Development / preview application id | `com.iposigh.mobile.dev` |
| Production application id | `com.iposigh.mobile` |

**Migration implications**

- Existing internal preview APKs on `com.iposigh.mobile.dev` **continue to upgrade** for development and preview profiles.
- The first **production** AAB/IPA is a **new** application id. It will **not** replace an installed `.dev` preview APK via Play upgrade.
- Do **not** change the preview package id without an approved migration plan (users would need to uninstall/reinstall).
- Signing: preserve the existing Expo-managed Android keystore for the current EAS project. Changing package id for production still uses EAS credentials for that package; confirm credentials in Expo dashboard before the first store upload.
- Deep links keep `iposigh://…`. Universal Links / App Links host association is not configured yet (custom scheme only).

---

## 4. Environment separation

| Env | `EXPO_PUBLIC_APP_ENV` | API origin rules | Cleartext HTTP | Package id |
| --- | --- | --- | --- | --- |
| Local development | `development` | Loopback default on simulator; LAN on physical device; tunnels allowed for short smoke tests only | Yes | `.dev` |
| Preview / staging | `preview` | Required `https` IPO Singh host; refuse loopback, vendor, ephemeral tunnels | No | `.dev` |
| Production | `production` | Required stable `https` IPO Singh host; same refusals | No | `com.iposigh.mobile` |

Set `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` and `EXPO_PUBLIC_IPO_SINGH_SITE_URL` in the matching **EAS environment** (not committed in git, not hardcoded in `eas.json`).

Never embed MongoDB, IPO Guru, admin, Redis, R2, or Expo push access tokens as `EXPO_PUBLIC_*`.

---

## 5. OTA update readiness (EAS Update)

| Item | Status |
| --- | --- |
| Dependency | `expo-updates` ~58.0.20 installed |
| Update URL | `https://u.expo.dev/<project-id>` |
| Channels | `development`, `preview`, `production` (via `eas.json`) |
| Runtime version | `policy: "appVersion"` (matches `version` `0.1.0`) |
| Check behaviour | `ON_LOAD`, `fallbackToCacheTimeout: 0` |
| Auto-publish | **Not** performed in this prompt |

**Requires a new native APK/AAB/IPA**

- First build after adding `expo-updates`
- Package / bundle id changes
- Permissions, notification plugin, cleartext, icons/splash, SDK upgrades

**Eligible for OTA** (same runtime version / channel)

- JS/TS screens, copy, preference UI, most business-logic fixes that do not need new native APIs

**Rollback**

- Republish a previous known-good update to the same channel, or rebuild and redistribute a native binary that embeds the prior JS bundle.
- Keep production `PUSH_DELIVERY_ENABLED` / allotment broadcast kill switches server-side; OTA cannot safely re-enable server secrets.

Do not run `eas update` until a native binary that includes `expo-updates` is installed on target devices.

---

## 6. Android and iOS build readiness

### Android

| Item | Status |
| --- | --- |
| Preview APK profile | Ready (`preview` → `apk`, channel `preview`) |
| Production AAB profile | Configured (`production` → `app-bundle`) |
| Expo-managed keystore | Preserve; do not replace without approval |
| Permissions | `POST_NOTIFICATIONS`; notification plugin channel `ipo-reminders` |
| Icons / adaptive icon / splash | Present; consider 1024×1024 store asset later |
| Deep links | Custom scheme intent filter |
| Stable preview API HTTPS origin in EAS | **Required before useful preview** |
| FCM for Expo push | Still required in Expo dashboard for reliable Android remote push |

### iOS

| Item | Status |
| --- | --- |
| Bundle id (prod) | `com.iposigh.mobile` when `EXPO_PUBLIC_APP_ENV=production` |
| Notification usage string | Present |
| Push plugin mode | `development` only for development env; production APNs for preview/production |
| Cloud EAS builds | Do not require local Xcode / macOS upgrade |
| Apple Developer Program | **Not** enrolled by this prompt — still required for device/TestFlight/App Store |
| APNs key in EAS | Still required for remote push |
| Universal Links | Not configured (scheme-only) |

---

## 7. Verification commands (local)

```bash
npm run typecheck -w @ipo-singh/mobile
npm run lint -w @ipo-singh/mobile
npm test -w @ipo-singh/mobile
cd apps/mobile && npx expo config --type public
cd apps/mobile && npx expo-doctor
```

Do **not** run `eas build`, `eas submit`, or `eas update` without explicit approval.

---

## 8. Remaining blockers

1. Stable HTTPS IPO Singh API origin for preview and production EAS environments (not a Cloudflare quick tunnel).
2. Confirm EAS login / project access and Android credentials for the production package id.
3. Apple Developer Program + APNs for iOS device/TestFlight/App Store.
4. FCM v1 credentials in EAS for Android push.
5. Optional: 1024×1024 store icon; Universal / App Links if required.
6. Physical-device smoke of push + deep links after a new native build that includes `expo-updates`.
7. Server push kill switches remain off until separately approved (`PUSH_DELIVERY_ENABLED`, `ALLOTMENT_BROADCAST_ENABLED`).

---

## Verdict

| Target | Verdict | Why |
| --- | --- | --- |
| **Android preview** | **READY** (config) / **BLOCKED** (runtime data) until a stable HTTPS staging API origin is set in EAS preview env | Profiles, package continuity, tunnel rejection, Update wiring are in place |
| **Android production** | **BLOCKED** | Needs production API HTTPS origin, Play listing/signing confirmation for `com.iposigh.mobile`, store assets, FCM; first AAB not built |
| **iOS production** | **BLOCKED** | Needs Apple Developer Program, APNs, production API origin, store assets; no IPA built |
