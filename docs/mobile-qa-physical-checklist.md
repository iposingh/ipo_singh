# Mobile QA — physical device checklist (Prompt 78)

Prepared 3 November 2026 (Asia/Kolkata). Automated checks in this prompt **do not** replace on-device confirmation of the earlier Android IPO-card crash.

**Status legend:** PASS · FAIL · NOT VERIFIED

Do not mark the chart/list crash **PASS on-device** until a **new** preview binary that includes Prompt 78 guards is installed and exercised.

---

## Builds under test

| Build | Android | iPhone |
| --- | --- | --- |
| Preview APK / IPA (post–Prompt 77/78) | NOT VERIFIED | NOT VERIFIED |
| Development client | NOT VERIFIED | NOT VERIFIED |
| Production store binary | NOT VERIFIED | NOT VERIFIED |

---

## A. Homepage

| # | Check | Android | iPhone |
| --- | --- | --- | --- |
| A1 | Mainboard open / upcoming / listed sections load | NOT VERIFIED | NOT VERIFIED |
| A2 | SME board switch and listings | NOT VERIFIED | NOT VERIFIED |
| A3 | Search + filters | NOT VERIFIED | NOT VERIFIED |
| A4 | Promotion / house banners | NOT VERIFIED | NOT VERIFIED |
| A5 | Loading, empty, error, pull-to-refresh | NOT VERIFIED | NOT VERIFIED |
| A6 | Long scroll without freeze | NOT VERIFIED | NOT VERIFIED |
| A7 | Every visible IPO card opens detail (no crash) | NOT VERIFIED | NOT VERIFIED |

## B. Detail navigation

| # | Check | Android | iPhone |
| --- | --- | --- | --- |
| B1 | Card → detail → system/header back | NOT VERIFIED | NOT VERIFIED |
| B2 | Valid slug deep link `iposigh://ipo/<slug>` | NOT VERIFIED | NOT VERIFIED |
| B3 | Invalid / missing IPO shows empty/error (no crash) | NOT VERIFIED | NOT VERIFIED |
| B4 | Registrar / document links open external browser safely | NOT VERIFIED | NOT VERIFIED |
| B5 | Share / site link when site URL configured | NOT VERIFIED | NOT VERIFIED |

## C. GMP & subscription

| # | Check | Android | iPhone |
| --- | --- | --- | --- |
| C1 | Current GMP ₹ / % / observed time (or Unavailable) | NOT VERIFIED | NOT VERIFIED |
| C2 | GMP history line + table; no crash on dense history | NOT VERIFIED | NOT VERIFIED |
| C3 | Subscription categories + day-wise history | NOT VERIFIED | NOT VERIFIED |
| C4 | Homepage cards still omit GMP/subscription | NOT VERIFIED | NOT VERIFIED |

## D. Watchlist & notifications (Prompt 76A)

| # | Check | Android | iPhone |
| --- | --- | --- | --- |
| D1 | Watchlist save/remove while signed in | NOT VERIFIED | NOT VERIFIED |
| D2 | OS permission request only after in-app explanation | NOT VERIFIED | NOT VERIFIED |
| D3 | Push token registration / revoke on logout | NOT VERIFIED | NOT VERIFIED |
| D4 | Mainboard global vs SME watchlist preference toggles | NOT VERIFIED | NOT VERIFIED |
| D5 | Notification tap → correct IPO slug | NOT VERIFIED | NOT VERIFIED |
| D6 | Real Expo delivery to this device | NOT VERIFIED — requires approved send | NOT VERIFIED |

Server kill switches (`PUSH_DELIVERY_ENABLED`, `ALLOTMENT_BROADCAST_ENABLED`) remain off unless explicitly approved. Do not claim delivery PASS without a real ticket/receipt on the device.

## E. Auth & settings

| # | Check | Android | iPhone |
| --- | --- | --- | --- |
| E1 | Register / login / logout / session after kill | NOT VERIFIED | NOT VERIFIED |
| E2 | Preferences persist (incl. Mainboard/SME alert channels) | NOT VERIFIED | NOT VERIFIED |
| E3 | Connection diagnostics hidden until long-press version | NOT VERIFIED | NOT VERIFIED |

## F. Stability

| # | Check | Android | iPhone |
| --- | --- | --- | --- |
| F1 | Background / resume mid-detail | NOT VERIFIED | NOT VERIFIED |
| F2 | Airplane mode → offline notice / cache | NOT VERIFIED | NOT VERIFIED |
| F3 | Slow API / timeout recovery | NOT VERIFIED | NOT VERIFIED |
| F4 | Keyboard on search / auth | NOT VERIFIED | NOT VERIFIED |
| F5 | Safe area / notch / gesture back | NOT VERIFIED | NOT VERIFIED |

---

## Automated coverage (this prompt)

See Prompt 78 report: mobile unit tests, chart sanitization, navigation guards, preference channel defaults, API board-policy regression. Those results are **not** physical-device PASS.

## Remaining blockers before declaring crash fixed

1. Install a **new** Android preview APK built after chart/list guards.
2. Open multiple IPO cards with GMP history (including dense series).
3. Confirm no native crash on Android  (and ideally iOS).
4. Optional: one approved single-device push after EAS credentials + kill-switch approval.
