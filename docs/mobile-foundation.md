# Expo mobile foundation

`apps/mobile` is the native IPO Singh app. It uses the existing Express API, MongoDB, and Redis through that API. It does not call IPO Guru and it does not keep a second catalogue.

## What is included

- Expo SDK 58, React Native 0.88, Expo Router, and TypeScript strict mode.
- Shared `@ipo-singh/contracts`, `@ipo-singh/core`, and the approved color, spacing, radius, type size, and touch-size tokens.
- Native tabs: Home (Mainboard IPOs), SME IPOs, Calendar, Watchlist, and Account. Search opens from the header. Compare opens after 2 to 4 IPOs are selected. GMP and subscription stay on each issue card.
- Light, dark, and system appearance. The choice is saved on the device under `ipo-singh-theme`. A signed-in choice is also saved on the account.
- A typed client for the IPO Singh API with an 8 second timeout, caller cancellation, and errors that do not invent IPO records.
- Home lists stored Mainboard IPOs in four sections: open, upcoming, recently closed, and recently listed. SME IPOs uses the same sections with the SME board filter.
- Each listing card shows the stored company, status, category, dates, price band, lot size, minimum investment, GMP in rupees and percent, and the last observation time. Missing values stay unavailable, and a stored zero stays zero.
- Pull to refresh, load more, and a short device cache. Offline mode shows the last saved list when one exists.
- The calendar uses `GET /api/v1/calendar` for one month at a time. It moves between months and filters Mainboard and SME. Each day lists stored opening, closing, allotment, and listing dates. An empty day stays empty. Choosing an event opens the IPO.
- Search uses `GET /api/v1/search`. It matches a stored company name, symbol, or partial text, and it can filter by Mainboard or SME and by status. The closed filter also includes allotment. Typing waits briefly, the keyboard search key sends the query immediately, and a short or empty query does not call the API.
- Comparison holds 2 to 4 stored IPOs from search, the calendar, or an IPO page. It uses `GET /api/v1/ipos/:slug` and lists price band, lot size, minimum investment, issue size, GMP, subscription, dates, financials, and actual listing performance. A missing figure stays unavailable. The table scrolls sideways on a narrow screen. It does not recommend an IPO.
- Choosing a card opens the stored IPO. The detail read uses `GET /api/v1/ipos/:slug` on the IPO Singh API. The page has seven sections: Overview, GMP, Subscription, Financials, Allotment, Listing, and Documents. Those sections scroll on the same page. They are not extra tabs.
- GMP history uses `GET /api/v1/ipos/:slug/gmp/history`. The GMP section charts daily and intraday readings in rupees or percent, marks the stored high and low, and lists the same readings. A missing day or slot is left blank.
- Subscription history uses `GET /api/v1/ipos/:slug/subscription/history`. The subscription section charts day-wise totals and categories, compares the stored categories, and lists each day. A missing multiple stays unavailable. A published zero stays 0x.
- Grey market premium stays unofficial. The chart is not a guaranteed return and is not the listing gain.
- Share uses the public website address `EXPO_PUBLIC_IPO_SINGH_SITE_URL` and the path `/ipos/<slug>`. An unset or invalid address leaves share unavailable. The share link is not the API origin and not IPO Guru.
- Allotment opens a verified official registrar page when one is stored. The app does not collect a PAN or an application number. Documents open only http and https addresses that have no username or password.
- Account can register, sign in, change the display name and password, end another session, and sign out. The access and refresh secrets are stored in Expo SecureStore under `ipo-singh.access-token` and `ipo-singh.refresh-token`. They are not stored with the theme. A saved session is restored when the app opens. An expired access secret is refreshed once, and simultaneous refreshes share that request. A revoked or reused refresh secret signs the device out. Offline sign-out clears the device and leaves the server session until it can be reached.
- The watchlist uses `GET`, `POST`, and `DELETE /api/v1/watchlist`. A save sends the stored IPO id. The same account sees that list on the website and in the app. Mainboard and SME can be filtered, and a saved issue opens its detail page. A missing catalogue row stays unavailable. Guests can browse, and the sign-in prompt appears when they save an IPO or open the watchlist.
- Account preferences use `PATCH /api/v1/auth/preferences`. They store the default list, appearance, IPO alerts, notification categories, and the mobile-push choice. The time zone stays Asia/Kolkata. A failed save restores the previous choice. Phone reminders are sent only when the choice is When available, the category is on, and this phone has registered a token.
- The header bell opens the in-app notification list. It uses the existing notification records through `GET /api/v1/notifications` and `GET /api/v1/notifications/unread-count`. Mark read and mark all read use the existing read routes. Alert choices use `PATCH /api/v1/notifications/preferences`. The app does not create notification events. Categories are IPO opening, IPO closing soon, allotment dates, listing dates, GMP changes, subscription milestones, schedule changes, and IPO Singh announcements. A stored IPO id opens that issue. An announcement has no IPO. Email and SMS are not sent.
- The Home list shows promotions from `GET /api/v1/promotions`. The API applies placement, schedule, and priority, and the app keeps that order. When the response is not managed, or the request fails with nothing saved, IPO Singh's own Mainboard, SME, and Calendar banners are shown. An empty managed list hides the carousel. A paid slide is labelled Advertisement or Sponsored. App-store and website app-download banners are not shown. Remote images use `GET /api/v1/promotions/media/:id` and are cached on the device. The carousel stays in the Home list header.
- Development, preview, and production separation through `EXPO_PUBLIC_APP_ENV`.
- EAS profiles in `apps/mobile/eas.json`.
- App icon and splash copied from the approved website brand images.
- Safe area padding in the header and on each screen, including horizontal insets for display cutouts.

Development application ids, to be replaced before a store listing:

- iOS bundle identifier: `com.iposigh.mobile.dev`
- Android package: `com.iposigh.mobile.dev`

## Environment

Copy `apps/mobile/.env.example` to `apps/mobile/.env` for local work. Expo reads `EXPO_PUBLIC_*` values at bundle time.

| Variable | Development | Preview and production |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `development` | `preview` or `production` |
| `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` | Optional. Unset uses `http://127.0.0.1:4000`. | Required `https` origin. Local hosts are refused. |
| `EXPO_PUBLIC_IPO_SINGH_SITE_URL` | Optional public website origin for share. Unset leaves share unavailable. | Required `https` origin when share should work. Local hosts are refused. |

A physical phone cannot reach `127.0.0.1` on the computer. Set the origin to this computer's LAN address while developing on a device. Do not put that local address in a preview or production build.

The app refuses `ipoguru.in` and any host under it, and it refuses a URL that contains a username or password. IPO Guru credentials stay on the API process.

For EAS, set `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` and `EXPO_PUBLIC_APP_ENV` as environment variables for the `development`, `preview`, and `production` environments. Do not commit those values. `eas.json` does not contain an API URL. Run `eas init` in `apps/mobile` when an Expo account is ready. That command creates the EAS project id. Do not invent one.

## Scripts

From the repository root:

```bash
npm run dev:mobile
npm run android -w @ipo-singh/mobile
npm run ios -w @ipo-singh/mobile
npm run lint -w @ipo-singh/mobile
npm run typecheck -w @ipo-singh/mobile
npm run test -w @ipo-singh/mobile
```

`npm run dev` still starts only the website and the API. The Expo server is separate because it waits for a device. The mobile start script links `expo-router` into the workspace root so the Expo CLI can generate typed routes. npm keeps that package inside `apps/mobile/node_modules`.

Metro compiled the iOS bundle (11,150,081 bytes) and the Android bundle (11,128,918 bytes). Both include the seven detail sections, the GMP and subscription charts, month navigation, search filters, the comparison note, registration, sign-in, password change, the SecureStore key, watchlist save and remove, the Mainboard and SME watchlist filter, the account preference controls, the notification bell, and the notification categories. A simulator and a physical device were not launched, so sign-in typing, session restore after a restart, watchlist taps, preference switches, notification taps, month taps, search typing, comparison scrolling, chart touch, section scrolling, sharing, and opening an external registrar or document link were not confirmed on a device. Login, registration, refresh, revoked sessions, offline sign-out, the shared watchlist, preference rollback, unread counts, read state, notification routes, calendar dates, empty search results, comparison selection, filtering, offline cache, share addresses, allotment addresses, large histories, sparse readings, and small-screen chart width are covered by tests.

## Android testing

1. Install Android Studio and an Android SDK platform.
2. Create an emulator, or enable USB debugging on a phone.
3. Install Expo Go for SDK 58 on that device.
4. Start the API (`npm run dev:api`) and the app (`npm run dev:mobile`).
5. For an emulator on the same computer, the default `http://127.0.0.1:4000` reaches the API. Android emulators often need `http://10.0.2.2:4000` instead. Set `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` and restart Expo.
6. For a phone, set the origin to the computer's LAN address and confirm the phone and computer are on the same network.
7. Open Home. It shows stored Mainboard issues in Open, Upcoming, Recently closed, and Recently listed, or an empty state when a section has none. SME IPOs uses the same sections for the SME board. Pull to refresh, load more when a page continues, and open a card. Save asks for sign-in until an account is open, then saves or removes that IPO. The IPO page scrolls through Overview, GMP, Subscription, Financials, Allotment, Listing, and Documents. GMP shows daily and intraday charts. Subscription shows the category comparison and the day-wise chart. Calendar shows the current month, moves to the previous or next month, and filters Mainboard and SME. Search is in the header. It accepts a company name or symbol, filters board and status, and shows an empty state when nothing matches. Add 2 to 4 IPOs and open Compare. The table scrolls sideways. Switch among Calendar, Watchlist, and Account. Watchlist lists the saved IPOs and filters Mainboard and SME. The header bell shows the unread count and opens Notifications. The list can mark one or all notices read, load another page, and open a related IPO. Account can switch light, dark, and system appearance, set the default list, alerts, notification categories, and the mobile-push choice, check the API, create an account, sign in, change the display name and password, end another session, and sign out.
8. A store or internal binary uses `eas build --profile preview --platform android` or `--profile production` after the EAS project and the public API origin exist.

This repository does not generate the `android/` directory. A custom development build, including `expo-dev-client`, is a later step.

## iOS testing

1. Use a Mac with Xcode and the iOS simulator runtime.
2. Install Expo Go for SDK 58 on the simulator or on an iPhone.
3. Start the API and `npm run dev:mobile`, then press `i` for the simulator or scan the QR code from Expo Go.
4. The simulator can use `http://127.0.0.1:4000`. An iPhone needs the computer's LAN address.
5. Confirm the same Home, detail sections, calendar, search, comparison, watchlist, notifications, account preferences, sign-in, tab, theme, and API check as on Android.
6. A store or internal binary uses `eas build --profile preview --platform ios` or `--profile production`. Apple signing certificates and a real bundle identifier are required before that build. The current identifier is a development placeholder.

CocoaPods and an `ios/` directory are not checked in. They appear only after a prebuild or a development build.

## Phone reminders

The app uses Expo Notifications (`expo-notifications` for SDK 58). The API sends to `https://exp.host/--/api/v2/push/send` from the sync worker after alert evaluation. It does not call IPO Guru for a reminder, and it does not send email or SMS.

A reminder is created only from a fresh stored IPO date or reading. Opening, allotment, and listing use the stored calendar date in Asia/Kolkata. A close date of tomorrow is the about-24-hour reminder. A close date of today is the same-day reminder. The about-1-hour reminder is sent only during the hour before `ALERT_IPO_CLOSE_HOUR_IST` on that stored close date. Stored IPO dates do not include a close time, so the 1-hour reminder is skipped when that hour is unset. GMP and subscription reminders stay off until those categories are on, and a stale reading does not create one.

The phone asks for notification permission only after Turn on phone reminders, and only when three things are true: the platform is iOS or Android, `expo-device` reports a physical device, and an EAS project id is present. This repository does not have an EAS project id yet, so the permission dialog is not shown. A denied permission stays on the explanation and is not requested again. The token is kept in Expo SecureStore under `ipo-singh.push-token` and registered with `POST /api/v1/notifications/push-tokens`. Logout and `DELETE /api/v1/notifications/push-tokens` revoke it. It is not stored in AsyncStorage.

Remote delivery needs a development build (`expo-dev-client` is not installed yet) and a physical iPhone or Android phone. Expo Go on Android does not deliver remote push from SDK 53 onward. iOS uses the development APNs environment when `EXPO_PUBLIC_APP_ENV` is development, and the production environment otherwise. Set `EXPO_PUSH_ACCESS_TOKEN` on the API when Expo credentials exist. A successful send changes the in-app record from `push: "not-sent"` to `sent`. A provider failure is retried up to `ALERT_MAX_ATTEMPTS`. `DeviceNotRegistered` retires that token.

Delivery has not been confirmed on a physical phone.

Metro compiled the iOS bundle (11,397,641 bytes) and the Android bundle (11,377,347 bytes). Both include phone-reminder registration, the SecureStore key, and the EAS project explanation. A simulator and a physical device were not launched, so the permission dialog, token registration, a foreground reminder, and a notification tap were not confirmed on a device.

## Promotions

The Home list reads `GET /api/v1/promotions`. That response is already limited to active home banners inside their schedule, ordered by priority. The app does not sort them again and does not keep a second admin screen. A response that is not managed, or a failed request with no saved copy, shows IPO Singh's own Mainboard, SME, and Calendar banners. Those banners are drawn in the app with the approved green and do not request the website. An empty managed list hides the carousel. The saved JSON stays on the device for seven days, the same window as the catalogue cache.

A paid slide must be labelled Advertisement or Sponsored. An external destination is https only, with no username or password, and it cannot target IPO Guru, a local host, or an app store. Known IPO Singh paths open the matching screen. An IPO path opens that issue. The website app-download banner is not shown. Remote artwork is loaded from `GET /api/v1/promotions/media/:id` and cached with `expo-image` using memory and disk. A failed image keeps the title and description on the brand background.

The carousel sits in the Home list header. It is not a full-screen ad and it is not a tab. Swipe, previous, next, and the position buttons move between slides. Autoplay waits 7 seconds and stays off when the viewer pauses it, touches it, leaves the app, or has reduced motion turned on. Reduced motion also moves between slides without animation. Light and dark controls use the theme surface and text colors. Text on a remote image sits on a dark scrim so it stays readable in both themes.

Metro compiled the iOS bundle (11,483,182 bytes) and the Android bundle (11,462,888 bytes). Both include the Home carousel, `/api/v1/promotions`, the Advertisement and Sponsored labels, the app-store refusal, and image caching. A simulator and a physical device were not launched, so swipe, image loading, offline display, and a 320-point screen were not confirmed in a running app.

## Not in this foundation

- A confirmed remote push on a physical iPhone or Android phone. The send path exists, and this repository has not completed that device check.
- Email verification and password-reset email. No email provider is configured.
- A separate mobile backend.
