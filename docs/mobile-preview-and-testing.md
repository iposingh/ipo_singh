# Mobile preview and integration testing

Prepared on 3 November 2026 from `apps/mobile` (Expo SDK 58). This guide covers **Android and iOS preview / integration testing only**. It is **not** a Play Store or App Store submission checklist. For EAS Update, production package ids, and release blockers see [`mobile-release-eas.md`](./mobile-release-eas.md) (Prompt 77). For the physical-device crash/QA checklist see [`mobile-qa-physical-checklist.md`](./mobile-qa-physical-checklist.md) (Prompt 78).

This session did **not** launch an iOS Simulator, Android Emulator, or physical phone on the authoring machine (Xcode, `simctl`, Android SDK, and `adb` were absent). Device and visual checks below that require those tools are marked **pending**.

## What the app is

- Expo Router app (`expo-router/entry`) talking only to the IPO Singh API.
- Primary tabs: Home, IPOs, Watchlist, Alerts, Settings.
- Secondary / deep routes: SME, Calendar, Search, Compare, Allotment, News, IPO detail, article detail.
- Appearance: light / dark / system (`userInterfaceStyle: automatic`).
- Auth secrets and push tokens: Expo SecureStore. Catalogue cache: AsyncStorage.
- Allotment: opens verified registrar pages only. **PAN and demat credentials are never collected.**

Application ids (historical `iposigh` short form; display name remains **IPO Singh**):

- Development / preview package: `com.iposigh.mobile.dev` (do not change silently — breaks APK upgrades)
- Production package (store builds): `com.iposigh.mobile` (separate app; does not upgrade `.dev` installs)
- URL scheme: `iposigh`
- Android reminder channel: `ipo-reminders`

## Prerequisites

| Prerequisite | Status on 3 Nov 2026 authoring machine | Notes |
| --- | --- | --- |
| Node.js 24.x | Available (`v24.22.0`) | Matches `engines` |
| Repo `npm install` | Required | Workspace installs mobile + API |
| IPO Singh API on `:4000` | Required for data screens | `npm run dev:api` from repo root |
| Xcode + iOS Simulator | **Missing** — pending | Needed for `npm run ios` |
| Android Studio / SDK / emulator | **Missing** — pending | Needed for `npm run android` |
| `adb` | **Missing** — pending | Physical Android USB |
| Expo account + `eas login` | **Not configured here** | Required for EAS builds / push project id |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | **Unset** | Run `eas init` in `apps/mobile`; do not invent an id |
| Apple Developer / Play Console | Not required for preview | Store submission out of scope |

## Environment configuration

Copy `apps/mobile/.env.example` → `apps/mobile/.env`. Only `EXPO_PUBLIC_*` keys belong in the mobile bundle.

| Variable | Simulator / same-host emulator | Android Emulator (AVD) | Physical device | Preview / staging HTTPS |
| --- | --- | --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `development` | `development` | `development` | `preview` |
| `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` | omit → `http://127.0.0.1:4000` | `http://10.0.2.2:4000` | `http://<LAN-IP>:4000` | `https://<api-host>` |
| `EXPO_PUBLIC_IPO_SINGH_SITE_URL` | optional | optional | optional | https site origin for share / legal |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | omit until `eas init` | omit until `eas init` | required for remote push | set in EAS env |

Rules enforced in code:

- Preview/production refuse `http` and loopback hosts.
- Physical devices refuse `localhost` / `127.0.0.1` / `::1`.
- `ipoguru.in` (and subdomains) are refused.
- IPO Guru API keys, MongoDB, Redis, and R2 secrets must stay on the API process — never as `EXPO_PUBLIC_*`.

Development builds set `android.usesCleartextTraffic: true` so LAN HTTP works. Preview/production cleartext is off.

## Exact run commands

Run from the **repository root** unless noted. Start the API first for any screen that loads catalogue data.

```bash
# API (required for live data)
npm run dev:api
```

### iOS Simulator

```bash
# Requires Xcode + a booted Simulator
npm run ios -w @ipo-singh/mobile
# equivalent:
npm run start -w @ipo-singh/mobile -- --ios
```

Optional Metro only, then press `i` in the terminal:

```bash
npm run dev:mobile
```

### Android Emulator

```bash
# Boot an AVD in Android Studio first, then:
# apps/mobile/.env should include:
# EXPO_PUBLIC_IPO_SINGH_API_ORIGIN=http://10.0.2.2:4000
npm run android -w @ipo-singh/mobile
```

### Physical Android device

```bash
# 1. Same Wi-Fi as the computer. USB debugging on. `adb devices` shows the phone.
# 2. apps/mobile/.env:
#    EXPO_PUBLIC_APP_ENV=development
#    EXPO_PUBLIC_IPO_SINGH_API_ORIGIN=http://192.168.x.x:4000
# 3. Prefer a development build (Expo Go does not deliver remote push for this app):
cd apps/mobile
npx eas-cli login
npx eas-cli init          # once; records project id — do not invent it
npx eas-cli build --profile development-device --platform android
# Install the APK from the EAS page, then:
cd ../..
npm run start -w @ipo-singh/mobile -- --dev-client
```

### Physical iPhone

```bash
# 1. Same Wi-Fi. Trust the computer. Apple ID for development signing via EAS.
# 2. apps/mobile/.env LAN API origin as above.
cd apps/mobile
npx eas-cli login
npx eas-cli init          # once, if not already done
npx eas-cli build --profile development-device --platform ios
# Install via the EAS install link / QR on the phone, then:
cd ../..
npm run start -w @ipo-singh/mobile -- --dev-client
```

### Internal preview binary (no Metro)

```bash
cd apps/mobile
# Set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN / SITE_URL / EAS_PROJECT_ID in the EAS *preview* environment
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

## EAS profiles (`apps/mobile/eas.json`)

| Profile | Purpose | Notes |
| --- | --- | --- |
| `development` | Dev client + **iOS Simulator** build | `developmentClient: true`, Android APK |
| `development-device` | Dev client for **physical** devices | iOS `simulator: false` |
| `preview` | Internal preview APK / IPA | `EXPO_PUBLIC_APP_ENV=preview`, HTTPS API required |
| `production` | Store-oriented channel | **Do not submit from this prompt** |

Missing until you run them:

1. `eas init` / Expo project id\
2. EAS environment secrets for API/site origins (never commit)\
3. Apple distribution cert / Android keystore (EAS can manage)\
4. FCM / APNs credentials for production push\

## Deep links

Scheme: `iposigh`

Examples:

- `iposigh://` → app home stack\
- `iposigh://ipo/fixture-mills` → IPO detail (slug validated)\
- `iposigh://news/some-article` → article detail\

Android `intentFilters` register the custom scheme. Universal / App Links for `https://` are **not** configured until a public site domain and associated domains / asset links exist.

## Notifications

- Permission is **not** requested on launch. Settings / account flow shows an explanation first.
- Android channel `ipo-reminders` (“IPO reminders”) is created at runtime and matches the Expo notifications plugin `defaultChannel`.
- iOS usage string: “IPO Singh sends reminders for IPO dates you choose to follow.”
- Remote Expo push requires: physical device + development/preview build + EAS project id. Expo Go is insufficient for this app’s remote reminders.

## Android back navigation

- Root navigator is an Expo Router `Stack` with `slide_from_right`. The system/hardware back button pops the stack via React Navigation.
- In-app header shows a Back control when `navigation.canGoBack()` is true and calls `goBack()`.
- `predictiveBackGestureEnabled` is `false` so preview behaviour matches the header control.

## Safe areas, text scaling, accessibility

- `SafeAreaProvider` wraps the tree. Headers and `ScreenContainer` / lists apply top, bottom, and horizontal insets.
- `AppText`, search, and text fields set `allowFontScaling`.
- Tab bar allows font scaling; touch targets use the shared 44-point token.
- VoiceOver / TalkBack visual passes: **pending** (no device on this machine).

## Appearance

- Settings / account preferences: Light, Dark, System.
- Guest theme is stored on device; signed-in theme syncs through account preferences.
- Automated theme resolution tests pass. Visual confirmation on device: **pending**.

## Automated verification (this machine)

| Check | Result |
| --- | --- |
| `npm run typecheck -w @ipo-singh/mobile` | Run during Prompt 70 — see session report |
| `npm run lint -w @ipo-singh/mobile` | Run during Prompt 70 — see session report |
| `npm run test -w @ipo-singh/mobile` | Includes `src/preview/*.test.ts` readiness suite |
| `npx expo config --type public` | Resolves SDK 58, name IPO Singh, scheme `iposigh`, intent filter, cleartext (dev), notifications channel |
| `npx expo-doctor` | Network-dependent; re-run with a working Expo API connection |
| iOS Simulator smoke | **Pending** — Xcode / `simctl` unavailable |
| Android Emulator smoke | **Pending** — Android SDK / `adb` unavailable |
| Physical Android / iPhone smoke | **Pending** — no devices attached |
| Metro JS bundle compile | **Passed** — `expo export` iOS Hermes bundle ~5.2MB; Android export also produced in this session. This is **not** a visual/device pass. |

Do **not** treat TypeScript or Metro export success as proof that layouts, gestures, or notifications look correct on a device.

## Device-test checklist

Use this on a simulator or device. Mark each row when observed.

| # | Flow | iOS Sim | Android Emu | Physical Android | Physical iPhone |
| --- | --- | --- | --- | --- | --- |
| 1 | Cold start → splash → Home | pending | pending | pending | pending |
| 2 | Home sections / empty states / pull to refresh | pending | pending | pending | pending |
| 3 | IPOs tab list + search | pending | pending | pending | pending |
| 4 | Open IPO detail; scroll Overview → Documents | pending | pending | pending | pending |
| 5 | Calendar month navigation (via house banner / route) | pending | pending | pending | pending |
| 6 | Watchlist sign-in gate + save/remove | pending | pending | pending | pending |
| 7 | News list + article + citation open | pending | pending | pending | pending |
| 8 | Settings: light / dark / system | pending | pending | pending | pending |
| 9 | Hardware / gesture back from detail → list | pending | pending | pending | pending |
| 10 | Large Dynamic Type / font scale | pending | pending | pending | pending |
| 11 | Safe area on notch / gesture bar | pending | pending | pending | pending |
| 12 | Offline banner + cached catalogue | pending | pending | pending | pending |
| 13 | Deep link `iposigh://ipo/<slug>` | pending | pending | pending | pending |
| 14 | Notification permission after explanation | n/a* | n/a* | pending | pending |
| 15 | Legal / privacy links open https site | pending | pending | pending | pending |

\*Remote push registration is intentionally unavailable on simulators / Expo Go without a project id.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Lists empty / API unreachable on Android emulator | `127.0.0.1` is the emulator itself | Set origin to `http://10.0.2.2:4000` and restart Expo |
| Physical phone cannot load API | Loopback or wrong LAN IP / firewall | Use computer LAN IP; same Wi-Fi; allow port 4000 |
| “vendor” / invalid origin | IPO Guru host or credentials in URL | Point only at IPO Singh API |
| Push stays unavailable | No EAS project id or not a physical dev build | `eas init`, rebuild with `development-device` |
| Metro cannot resolve `expo-router` | Workspace hoist | `npm run start -w @ipo-singh/mobile` runs `scripts/ensure-cli-resolution.cjs` |
| Cleartext blocked on Android | Preview/production build hitting `http://` | Use https staging API or a development profile |
| Splash / icon look soft | Splash asset is 298×298 | Optional: replace with a sharper brand splash before store work |

## Unresolved blockers

1. **No local iOS/Android runtime** on the authoring Mac used for Prompt 70 — all interactive device rows remain pending.\
2. **No EAS project id** in the repo — remote push and cloud builds need `eas init` + account login.\
3. **Package id still `com.iposigh.mobile.dev`** — acceptable for preview; must change before store submission.\
4. **HTTPS staging API origin** not checked into git (correct) — operators must set EAS preview env vars.\
5. **Universal Links / App Links** not wired — custom scheme only.\
6. **Splash icon resolution** is modest (298×298); fine for internal preview, revisit for store polish.\
7. Transitive **npm audit** findings in the Expo toolchain (e.g. `zod` major, `node-forge`) are tracked separately from preview readiness; do not force-breaking upgrades during a device pass.

## Security reminder for preview builds

- Scan preview binaries for `IPO_GURU`, Mongo URIs, Redis URLs, and R2 secrets before sharing internally.\
- Do not put provider credentials in `eas.json` or `EXPO_PUBLIC_*`.\
- Do not submit these development identifiers to either store from this prompt.
