# Notification and Expo push — production policy

**Prompt:** 76A (extends 76)\
**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Mainboard-global vs SME-watchlist-only eligibility for every notification category (including confirmed Allotment Out), preference defaults, Mainboard frequency/digest caps, anonymous device handling, Expo delivery/receipts, IST scheduling, ops metrics.\
**Does not:** enable production broadcasts, send device pushes without approval, invent close-of-day clock times from date-only IPO fields, or infer IPO board from slug text.

---

## 1. Fundamental board policy (non-negotiable)

| Board | Recipient selection |
| --- | --- |
| **Mainboard** | Global to eligible opted-in registered users and anonymous devices. **No watchlist required.** |
| **SME** | Only owners whose associated watchlist contains that specific IPO. **No global SME broadcast.** |
| Missing / unrecognized board | Do **not** broadcast globally. Log safely and skip / quarantine the event. |

Board is always read from the normalized stored IPO `board` field — never from slug naming.

This rule applies to **every** category, including confirmed **Allotment Out**. The previous SME Allotment Out global-broadcast exception is removed.

---

## 2. Notification event matrix

| Notification event | Mainboard IPO | SME IPO |
| --- | --- | --- |
| IPO Opening Today / ~24h | Global opted-in | Watchlist only |
| IPO Closing Tomorrow / Today | Global opted-in | Watchlist only |
| IPO Listing Today | Global opted-in | Watchlist only |
| IPO Schedule Changes | Global opted-in | Watchlist only |
| Significant GMP Changes | Global opted-in | Watchlist only |
| Subscription Updates | Global opted-in | Watchlist only |
| Confirmed Allotment Out | Global opted-in | Watchlist only |
| Allotment **date** reminder (estimated date) | Global opted-in | Watchlist only |

Additional gates always apply: valid push consent / token, relevant category preference, opt-outs, dedupe, frequency limits, and kill switches.

Stale or missing catalogue freshness produces **no** watchlist/global candidates from the alert engine. Allotment Out queues only after registrar confirmation evidence — never from an unverified estimated allotment date.

---

## 3. Recipient-selection engine

Central helpers live in `apps/api/src/notifications/eligibility.ts`:

- `notificationScopeForBoard(board)` → `"global" | "watchlist" | "skip"`
- `accountAllowsBoardAlerts(...)` — signed-in prefs + category + board channel
- `anonymousAllowsBoardAlerts(...)` — device-token flags for anonymous owners

**SME path** (`notifications/engine.ts`): paginated watchlist batches → filter to SME board → evaluate → insert only when SME channel + category allow. Baselines still advance for opted-out owners so re-enabling does not replay history.

**Mainboard path**: paginated active push owners (`listActiveOwnerIds`) → require `mainboardGlobalAlerts` → evaluate all Mainboard catalogue issues → apply daily non-critical cap / digest → insert. Watchlist presence does not change eligibility.

**Allotment Out** (`jobs/allotment/notify.ts`): same board scope at the final recipient-selection stage. `ALLOTMENT_BROADCAST_ENABLED=true` cannot bypass SME watchlist restrictions. Service passes stored `board` into the notifier.

Scalable batching: watchlist cursor + Mainboard owner cursor (`ALERT_BATCH_SIZE`, default 40). Watchlist has `{ ipoId, addedAt }` index for allotment SME fan-out via `listByIpo`.

---

## 4. Preferences and consent

Signed-in account preferences (`packages/contracts` / account preferences UI):

| Preference | Default | Meaning |
| --- | --- | --- |
| `mainboardGlobalAlerts` | **false** | Opt into Mainboard global alerts (no watchlist) |
| `smeWatchlistAlerts` | **false** for new accounts; migrated from legacy `alertsEnabled` when the new flag is absent | SME watchlist-channel alerts |
| `alertsEnabled` | preserved | Master alert switch |
| Per-category flags | preserved | open, closing, listing, gmp, subscription, schedule, allotment, announcement |
| `mobilePush` | `off` until user enables | Phone delivery when a token is registered |

**Migration:** existing users are **not** silently opted into Mainboard global alerts. Legacy `alertsEnabled: true` maps to `smeWatchlistAlerts: true` only when `smeWatchlistAlerts` was never stored. OS push permission alone is not consent for every optional category.

Users can disable Mainboard global while keeping SME watchlist alerts, and vice versa.

Anonymous devices store `mainboardGlobalAlerts`, `smeWatchlistAlerts`, and `allotmentAlertsEnabled` on the push-token record. Guest SME eligibility uses the device-associated watchlist (`anon:<installationId>`).

---

## 5. Mainboard frequency controls

| Control | Default | Env |
| --- | --- | --- |
| Max non-critical Mainboard pushes per owner per **IST** day | 3 | `ALERT_MAINBOARD_MAX_NONCRITICAL_PER_DAY` |
| Critical priority | open, closing, listing, allotment | (always prefer over digest) |
| Overflow | Combine remaining eligible events into a digest | `frequency.ts` |
| GMP threshold | Absolute ₹ change between fresh readings | `ALERT_GMP_CHANGE_RUPEES` (default 10) |
| Subscription | Meaningful milestones only (1 / 2 / 5 / 10×) | `evaluate.ts` |
| Last-hour close reminder | Disabled unless configured | `ALERT_IPO_CLOSE_HOUR_IST` |

When the daily non-critical cap is reached, eligible leftover events are digested rather than silently dropped. Critical events still deliver. Stale reminders after their event window are not generated (date-bound dedupe keys). Digest deep links open the Mainboard listing / notifications surface — never an unrelated IPO.

Calendar math uses `Asia/Kolkata`.

---

## 6. Anonymous users and watchlists

| Channel | Anonymous eligibility |
| --- | --- |
| Mainboard | Valid consent + applicable device prefs; **no** watchlist |
| SME | Device watchlist must contain that IPO under `anon:<installationId>` |

Do not mix watchlists across installations. Account/device ownership checks from Prompt 75 remain (anonymous registration cannot take over an active signed-in token). Sign-in / register continues to use existing watchlist association without duplicate push subscriptions.

---

## 7. Deep linking

- Individual IPO pushes carry public slug in `data.slug` / notification `ipoId` field (stored catalogue slug; allotment uses `slug ?? ipoId`).
- Mobile `routeFromPushData` → `/ipos/{slug}`.
- Digests must not deep-link to an unrelated IPO.
- Removed / invalid IPOs fail gracefully on the client.

Automated routing unit tests cover data → route mapping. Cold/background/foreground physical verification remains a separate device test.

---

## 8. Durable queue, dedupe, retry, receipts

| Concern | Behaviour |
| --- | --- |
| Queue | In-app row first (`push: not-sent`); worker later sends |
| Dedupe | Unique `dedupeKey` per owner (`insertIfNew`); IPO + event type + version |
| Allotment Out dedupe | `ipo-allotment-confirmed:<ipoId>` per owner |
| Retry / backoff | Exponential delay; `ALERT_MAX_ATTEMPTS` |
| Invalid tokens | Ticket/receipt `DeviceNotRegistered` → token `invalid` |
| Receipts | `runPushReceiptCheck` polls Expo |
| Kill switches | `PUSH_DELIVERY_ENABLED` (default **false**); `ALLOTMENT_BROADCAST_ENABLED` (default **false**) |

Delivery workers re-check preferences and board channel gates before Expo calls; they cannot bypass eligibility.

---

## 9. Admin / ops monitoring

- Ops status (`X-Ops-Token`): `alerts` + `push` counters (examined/sent/failed/skipped/invalidTokens, receipts, last status).
- Allotment verification rows store `notificationDispatch` and eligible device counts.
- Admin allotment confirm still gated by `ALLOTMENT_BROADCAST_ENABLED` and board eligibility.

---

## 10. Activation (requires explicit approval)

Keep both switches off until approved:

```text
PUSH_DELIVERY_ENABLED=false
ALLOTMENT_BROADCAST_ENABLED=false
```

When activating a **single test device** only:

1. Build a dev client with a real EAS `projectId` (Expo Go is insufficient for these remotes).
2. Register that device; note its Expo push token / installation id.
3. Explicitly opt the account/device into the intended channels (`mainboardGlobalAlerts` and/or `smeWatchlistAlerts` + categories).
4. Set `PUSH_DELIVERY_ENABLED=true` and `EXPO_PUSH_ACCESS_TOKEN` on a **non-production** worker if possible.
5. Leave `ALLOTMENT_BROADCAST_ENABLED=false` unless the test is a narrowly scoped allotment-out to that owner only (never enable global broadcast for a casual test).
6. Trigger one Mainboard reminder (no watchlist) or one SME reminder (with watchlist) for that owner.
7. Confirm deep link opens the correct IPO; confirm receipt invalidation with a revoked token in staging.
8. Turn `PUSH_DELIVERY_ENABLED` back to **false** after the test unless production go-live is separately approved.

**Never** broadcast a test Allotment Out to all eligible devices. Enabling `ALLOTMENT_BROADCAST_ENABLED` must still respect SME watchlist-only rules.

### Safe production rollout (after approval)

1. Confirm kill switches still default false in prod config.
2. Deploy API + mobile preference UI with defaults off.
3. Verify migration: existing users retain SME-from-`alertsEnabled` mapping; Mainboard stays off.
4. Enable push delivery for a canary cohort / single devices first.
5. Only then consider `ALLOTMENT_BROADCAST_ENABLED` for Mainboard confirmed allotments, with SME watchlist path verified in staging.

---

## 11. Physical-device verification (separate from mocked tests)

| Item | Status |
| --- | --- |
| Mocked Expo HTTP tests | Pass (Prompt 76 / 76A) |
| Physical iOS/Android with EAS project | **Not run** — no approved test device send |
| Production `PUSH_DELIVERY_ENABLED` / `ALLOTMENT_BROADCAST_ENABLED` | Remain **false** until explicit approval |

To request a device test: provide the designated Expo push token (or signed-in test account + installation id) and approve a one-device send. Do not approve “send to everyone.”

---

## 12. Code touchpoints (Prompt 76A)

| Area | Role |
| --- | --- |
| `notifications/eligibility.ts` | Board scope + preference gates |
| `notifications/frequency.ts` | Mainboard daily cap + digest |
| `notifications/engine.ts` | SME watchlist pass + Mainboard owner fan-out |
| `jobs/allotment/notify.ts` | Board-scoped Allotment Out recipients |
| `jobs/allotment/service.ts` | Passes stored `board` into notifier |
| `accounts/session-service.ts` | Preference normalize / migration |
| `contracts` account + device push schemas | `mainboardGlobalAlerts` / `smeWatchlistAlerts` |
| Mobile account preferences + `pushSetupCopy` | Clear Mainboard vs SME consent copy |
| `docs/notifications-production.md` | This guide |
