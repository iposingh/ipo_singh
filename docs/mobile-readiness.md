# Expo mobile readiness

Checked on 27 October 2026 from `apps/mobile`. This is the Expo SDK 58 app. It talks only to the IPO Singh API. No Android or iOS store build was run in this check.

## Implemented features

- Startup through Expo Router, with Home, SME, Calendar, Watchlist, and Account tabs.
- Mainboard and SME lists from `GET /api/v1/ipos`, with pull to refresh, paging, and a device cache.
- IPO detail with Overview, GMP, Subscription, Financials, Allotment, Listing, and Documents on one scrolling page.
- GMP and subscription charts from the stored history routes. A large chart hides point markers after 80 readings and keeps every stored reading in the table. Axis labels stay limited.
- Calendar, search, and comparison of 2 to 4 stored IPOs.
- Registration, sign-in, profile, password change, session revoke, and sign-out on the same account as the website.
- Watchlist and account preferences, including light, dark, and system appearance.
- In-app notifications and a phone-reminder registration path. Remote delivery is not confirmed.
- Notification data opens the stored IPO. An announcement has no IPO route.
- Home promotion carousel from `GET /api/v1/promotions`, with IPO Singh house banners when the list is not managed.
- Offline and error states that keep the last saved catalogue, history, watchlist, promotions, or session when one exists, and that do not invent IPO records.

## Test results

| Check | Automated | Simulator | Physical device |
| --- | --- | --- | --- |
| App startup | iOS bundle HTTP 200, 11,483,182 bytes. Android bundle HTTP 200, 11,462,888 bytes. Native process launch was not run. | Not performed. | Not performed. |
| Mainboard home | Listing, empty-page, cache, and offline tests passed. | Not performed. | Not performed. |
| SME listing | Board filter tests passed. The SME screen uses the same list with `board=sme`. | Not performed. | Not performed. |
| IPO details | Detail route, section, missing-versus-zero, and share-link tests passed. | Not performed. | Not performed. |
| GMP and subscription charts | History, large-series, sparse-series, zero, and small-screen tests passed. | Not performed. | Not performed. |
| Calendar | Month, empty day, and paging tests passed. | Not performed. | Not performed. |
| Search | Short-query refusal, match, and empty-result tests passed. | Not performed. | Not performed. |
| Comparison | 2 to 4 IPO selection and missing-figure tests passed. | Not performed. | Not performed. |
| Login and registration | Bearer session, refresh, revoked refresh, rate limit, and offline logout tests passed. | Not performed. | Not performed. |
| Watchlist | Shared account list, duplicate save, rollback, and expired-session tests passed. | Not performed. | Not performed. |
| User preferences | Preference sync, failed save, and local guest theme tests passed. | Not performed. | Not performed. |
| In-app notifications | Unread count, mark read, and expired-session tests passed. | Not performed. | Not performed. |
| Native push registration | Permission stays off until an explanation, a physical device, and an EAS project id are all present. This repo has no EAS project id. | Not performed. | Not performed. |
| Notification deep links | A payload with `ipoId` maps to the IPO route. An announcement does not. A tap on a delivered notification was not run. | Not performed. | Not performed. |
| Advertisement carousel | Order, paid labels, destination checks, image URL, offline cache, empty managed list, reduced motion, and a 288-point frame passed. | Not performed. | Not performed. |
| Light, dark, and system themes | Theme choice tests passed. The resolved config sets `userInterfaceStyle` to `automatic`. | Not performed. | Not performed. |
| Offline and error states | Catalogue, history, search, watchlist, notifications, auth, and promotion tests passed. | Not performed. | Not performed. |

`npm run test` in `apps/mobile` passed 65 tests. `npm run typecheck` and `npm run lint` passed. `npx expo-doctor` passed 20 of 20 checks. `npx expo config --type public` resolved SDK 58.0.0.

Node is 24.22.0, which matches the package engine `24.x`.

Xcode is not installed. `xcrun simctl` is unavailable, and `adb` is not on this machine. No simulator and no physical phone were launched.

## Security

Both bundles were scanned after this session's Metro compile.

- No IPO Guru API key, `IPO_GURU` value, MongoDB URL, bearer token, Expo push access token, Expo push token value, Google API key, or private key. The string `ipoguru` appears only as the preference field `ipoGuruEnabled` and as host checks that refuse `ipoguru.in`. Neither bundle contains `https://ipoguru` or `http://ipoguru`.
- Access and refresh tokens use Expo SecureStore keys `ipo-singh.access-token` and `ipo-singh.refresh-token` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The push token uses `ipo-singh.push-token` in the same store. Theme and catalogue JSON use AsyncStorage. `apps/mobile/.env` is absent. `.env*` files are gitignored except `.env.example`.
- Session refresh is one shared request. Tests cover a single refresh for simultaneous calls, clearing credentials after a revoked refresh, keeping credentials on HTTP 429, and clearing the device on offline logout while leaving the server session until it can be reached.
- The allotment section states that PAN and application numbers are not collected. There is no PAN field.
- External promotion links must be https, without a username or password, and cannot target IPO Guru, a local host, or an app store. Document and allotment links allow only http or https without credentials. Share uses the public site origin.
- Mobile source has no `console.log`, `console.debug`, `console.info`, or `console.warn`. Password fields use `secureTextEntry`. Tokens are not written to AsyncStorage.

## Performance

These timings were not measured: app startup, list scroll frame rate, chart frame rate, memory, and navigation response. The checks below are from code and tests.

- Lists use a windowed `SectionList` (`initialNumToRender` 8, `maxToRenderPerBatch` 6, `windowSize` 7). Android clips subviews.
- Charts keep stored readings and limit axis ticks to 4 labels. More than 80 plotted points hide the point markers. The table still lists the stored rows.
- Catalogue and history clients share one in-flight request per key. Detail cards load at most 3 issues at a time. Auth refresh uses one in-flight refresh.
- Promotion images use `expo-image` with `memory-disk`. Promotion JSON uses the same 5-minute fresh and 7-day stale cache as the catalogue.
- Touch targets use the 44-point token. Text allows font scaling. The carousel turns autoplay off when reduced motion is on. A VoiceOver or TalkBack pass was not run.

## Build readiness

`npx expo-doctor` reported SDK-compatible dependency versions. Installed versions include `expo` ~58.0.19, `react-native` 0.88.0, `react` 19.3.0, and `expo-router` ~58.0.26.

| Profile | `EXPO_PUBLIC_APP_ENV` | Android cleartext in this config | Push plugin mode | Distribution |
| --- | --- | --- | --- | --- |
| development | `development` | Not set. This SDK config type has no cleartext field. | `development` | internal |
| preview | `preview` | Not set. The app refuses a non-https origin. | `production` | internal |
| production | `production` | Not set. The app refuses a local or non-https origin. | `production` | store |

`expo config` confirmed those three environments. Preview and production both keep package `com.iposigh.mobile.dev` until that placeholder is replaced. There is no `owner` and no `extra.eas.projectId`.

The development and preview profiles install an internal binary. `expo-dev-client` is not installed, so this development profile is not a Metro dev client.

### Android

- Package: `com.iposigh.mobile.dev`
- Adaptive icon: `apps/mobile/assets/adaptive-icon.png`, 512×512, on `#F8FAFC`
- App icon: `apps/mobile/assets/icon.png`, 512×512
- Scheme: `iposigh`
- No `google-services.json`

### iOS

- Bundle identifier: `com.iposigh.mobile.dev`
- Tablet support is on
- Notification purpose string: "IPO Singh sends reminders for IPO dates you choose to follow."
- Splash: `apps/mobile/assets/splash-icon.png`, 298×298, contained on `#F8FAFC`
- No `ios/` or `android/` directory is checked in. Prebuild creates them during an EAS build.

### Signing and store requirements

Android, before a Play listing:

1. Replace `com.iposigh.mobile.dev` with the final package name. The first Play upload fixes that name.
2. Run `npx eas-cli login` and `npx eas-cli init` in `apps/mobile` so the project id exists.
3. Let EAS create the upload keystore, or supply an existing one. Enroll in Play App Signing.
4. Provide a 1024×1024 icon. The current icon and adaptive icon are 512×512. No 1024 source is in the repo, so this check did not upscale one.
5. Upload an FCM v1 service account to EAS for Android push. Do not commit that JSON.
6. Complete the Play listing, privacy policy, data safety form, and content rating.

iOS, before an App Store or TestFlight listing:

1. Replace `com.iposigh.mobile.dev` with the App Store Connect bundle id.
2. Use an Apple Developer Program account. EAS can create the distribution certificate and provisioning profile.
3. Provide a 1024×1024 App Store icon with no transparency.
4. Upload an APNs auth key to EAS. Preview and production use the production APNs environment. Development uses the sandbox environment.
5. Answer export compliance in App Store Connect.

No store build or submit was run. `eas.json` has an empty production submit profile.

### Build commands

`eas-cli` 26.0.0 is installed and satisfies the `>= 16.0.0` requirement in `eas.json`. Run these from `apps/mobile` after `npx eas-cli login` and `npx eas-cli init`. They were not executed in this check.

```sh
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform android
npx eas-cli build --profile production --platform ios
```

A production submit, after a finished production build, is:

```sh
npx eas-cli submit --profile production --platform android
npx eas-cli submit --profile production --platform ios
```

Set `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` and `EXPO_PUBLIC_IPO_SINGH_SITE_URL` in the matching EAS environment. Both must be https for preview and production, and neither may be an IPO Guru host. Leave secrets out of `eas.json`.

## Push notification status

The app can ask for permission only after the in-app explanation, and only on a physical iPhone or Android phone that has an EAS project id. Registration uses `POST /api/v1/notifications/push-tokens`. Logout revokes the token. The API worker can send to Expo push. This repository has no EAS project id, no APNs key, no FCM credentials, and no `EXPO_PUSH_ACCESS_TOKEN` in the mobile app. Delivery has not been confirmed. A denied permission is left denied.

Each EAS profile now sets `EXPO_PUBLIC_APP_ENV`. Without that, a preview or production build evaluated the notification plugin as the development APNs sandbox.

## Known issues

- Store identifiers are still the development placeholder on every profile.
- Icons are 512×512 and the splash mark is 298×298. App Store and Play expect a 1024×1024 icon.
- No EAS project is linked.
- Remote push has not been delivered to a phone.
- Share and unknown internal promotion links stay unavailable until `EXPO_PUBLIC_IPO_SINGH_SITE_URL` is a valid public origin.
- A phone cannot use `http://127.0.0.1:4000`. Development on a device needs this computer's LAN origin.
- Email verification and password reset have no email provider.
- Startup time, scrolling, memory, and navigation speed were not measured on a device.

## Remaining release blockers

1. Choose the final Android package and iOS bundle id, then put them in `apps/mobile/app.config.ts`.
2. Add a 1024×1024 icon and confirm the splash artwork.
3. Create the EAS project and sign in.
4. Set preview and production `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` and `EXPO_PUBLIC_IPO_SINGH_SITE_URL` to https IPO Singh origins.
5. Create Android and iOS signing credentials through EAS.
6. Add the FCM v1 service account and the APNs key for push, then confirm one reminder on a physical phone.
7. Complete a real `eas build` for each store platform. This check did not.
8. Install Xcode and an Android emulator, or use physical devices, and repeat the functional list on both platforms.
