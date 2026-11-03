# Final release candidate — Prompt 85

**Date:** 3 November 2026 (Asia/Kolkata)\
**Purpose:** Identify a reproducible software release candidate for comprehensive manual testing.\
**Does not:** commit, tag, deploy, EAS build, store submit, or enable push.

Prior audits (linked, not duplicated):\
`final-release-readiness.md`, `prompt-81-integration-audit.md`, `android-play-store-readiness.md`, `ios-app-store-readiness.md`, `production-deployment-readiness.md`, `release-blockers.md`.

---

## 1. Recommended candidate identity

| Field | Value |
| --- | --- |
| Suggested tag (after approval + clean commit) | **`v0.1.0-rc.1`** |
| Why not `v1.0.0-rc.1` | App/marketing version remains **0.1.0**; 1.0.0 is not approved |
| Git branch | `main` |
| `git rev-parse HEAD` (at audit) | `a638db60dcf8c8ca77122ec69475c4e253bf5605` |
| HEAD meaning | Early “engineering rules” commit — **does not contain** the current monorepo product tree |
| Working tree | **Dirty / largely untracked** (`apps/*`, `packages/*`, `docs/*`, CI, lockfile changes) |
| Lockfile | `package-lock.json` present (lockfileVersion 3) |
| Node | `24.x` (`.nvmrc` = 24); audit host Node `v24.22.0` |
| Expo SDK | `~58.0.22` |
| App versionName | `0.1.0` |
| Android `versionCode` | `1` |
| iOS `buildNumber` | `1` |
| API / web / mobile package version | `0.1.0` |
| Android packages | preview `com.iposigh.mobile.dev` / production `com.iposigh.mobile` |
| iOS bundles | same pattern as Android |
| URL scheme | `iposigh://` |

### How to create a reproducible RC after approval

1. Review and commit the monorepo (developer-approved commit only — this prompt does **not** commit).\
2. Ensure CI green on that commit (`.github/workflows/ci.yml`).\
3. Tag locally: `git tag -a v0.1.0-rc.1 -m "IPO Singh release candidate 0.1.0-rc.1"`.\
4. Do **not** push tags or start EAS until staging HTTPS and secrets exist.\
5. Record the **post-commit** SHA in this file when tagging.

Until step 1–3 complete, treat the RC as **workspace snapshot + automated green**, not a git-immutable artifact.

---

## 2. Feature inventory (implementation vs verification)

Legend: **Impl** = IMPLEMENTED / PARTIAL / MISSING. **Verify** = AUTOMATED TESTED / MANUALLY VERIFIED / NOT VERIFIED.

### Website

| Feature | Impl | Verify |
| --- | --- | --- |
| Homepage / Mainboard / SME / status sections | IMPLEMENTED | AUTOMATED TESTED; browser QA NOT VERIFIED |
| Search / calendar / compare | IMPLEMENTED | AUTOMATED TESTED |
| IPO detail, GMP, GMP history, subscription, history | IMPLEMENTED | AUTOMATED TESTED |
| Financials / documents / anchors | IMPLEMENTED (stored fields) | AUTOMATED TESTED; live provider NOT VERIFIED |
| Registrar / allotment links (no PAN) | IMPLEMENTED | AUTOMATED TESTED |
| Auth / watchlists / notifications inbox | IMPLEMENTED | AUTOMATED TESTED |
| Advertisements / app download promos | IMPLEMENTED / PARTIAL (store URLs empty) | AUTOMATED TESTED |
| SEO (meta, sitemap, robots, JSON-LD, OG) | IMPLEMENTED | AUTOMATED TESTED |
| Responsive + light/dark/system | IMPLEMENTED | AUTOMATED (tokens); visual NOT VERIFIED |
| Account deletion | IMPLEMENTED | AUTOMATED TESTED |

### Mobile (shared Android/iOS JS)

| Feature | Impl | Verify |
| --- | --- | --- |
| Listings / detail / search / auth / settings / prefs | IMPLEMENTED | AUTOMATED TESTED; device NOT VERIFIED |
| GMP / subscription charts | IMPLEMENTED + crash guards | AUTOMATED TESTED; **physical crash retest NOT VERIFIED** |
| Watchlists (signed-in) | IMPLEMENTED | AUTOMATED TESTED |
| Guest watchlist UI | PARTIAL (unsupported UX) | AUTOMATED TESTED (intentional) |
| Push registration path | IMPLEMENTED | AUTOMATED; live APNs/FCM NOT VERIFIED |
| Deep links / ads / registrar | IMPLEMENTED | AUTOMATED; device NOT VERIFIED |
| Account deletion | IMPLEMENTED | AUTOMATED TESTED |
| Offline / error states | IMPLEMENTED | AUTOMATED partial; device NOT VERIFIED |

### Backend

| Feature | Impl | Verify |
| --- | --- | --- |
| Public catalogue/detail APIs | IMPLEMENTED | AUTOMATED TESTED |
| Auth / sessions / CSRF / roles / admin | IMPLEMENTED | AUTOMATED TESTED |
| MongoDB / Redis / health / ready | IMPLEMENTED | AUTOMATED TESTED (memory/integration) |
| IPO Guru sync + quotas | IMPLEMENTED | AUTOMATED (mocked); live key NOT VERIFIED |
| Workers (sync, alerts, allotment, push receipts) | IMPLEMENTED | AUTOMATED + build; live worker NOT VERIFIED |
| Notification 76A audience | IMPLEMENTED | AUTOMATED TESTED |
| Push delivery | IMPLEMENTED, kill-switched off | NOT VERIFIED (forbidden) |
| Rate limit / logging / redaction | IMPLEMENTED | AUTOMATED TESTED |

---

## 3. Cross-platform consistency

Shared `@ipo-singh/contracts` + `@ipo-singh/core` (`resolveIpoLifecycle`, board field, freshness). Clients do not invent GMP/subscription on homepage cards. Lifecycle: Upcoming → Open → Closed → Allotment (awaited/out only if `allotmentConfirmed`) → Listed. IST date helpers in core. No contradictory client-side market math found in this audit.

---

## 4. Notification (76A) release state

| Rule | Status |
| --- | --- |
| Mainboard global (opt-in, no watchlist) | Preserved; automated |
| SME watchlist-required | Preserved; automated |
| Allotment broadcast board-scoped | Preserved; no policy conflict |
| Kill switches | `PUSH_DELIVERY_ENABLED` / `ALLOTMENT_BROADCAST_ENABLED` default **false** |
| Close hour | Only if `ALERT_IPO_CLOSE_HOUR_IST` set |

---

## 5. Android crash regression (code)

Guards intact: `sanitizePlotPointsForNative`, `safeChartSpacing`, `ChartSafeBoundary`, `removeClippedSubviews={false}`, point caps, finite frames. Tests in `apps/mobile/src/detail/navigation.test.ts` and `charts/series.test.ts`. **Physical verification still open (RB-06).**

---

## 6. Security gate (summary)

| Control | Status |
| --- | --- |
| Server-only Guru / DB / Redis / ops secrets | OK |
| Mobile `EXPO_PUBLIC_*` secret-free | OK (tests) |
| Tunnel origins refused staging/prod | OK |
| Account deletion path | OK |
| Admin / ops protection | OK |
| Residual advisories | Zod major deferred; node-forge via Expo tooling — see RB-11 |

`npm audit --omit=dev` (this audit): moderate minimatch + high node-forge + high Zod (breaking fix). Do not force-upgrade in this prompt.

---

## 7. Automated verification (Prompt 85)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass (all workspaces) |
| `npm run lint` | Pass |
| API tests | **288** pass / 0 fail |
| Web tests | **91** pass |
| Mobile tests | **118** pass |
| Core / contracts | **32** / **15** pass |
| `npm run build -w @ipo-singh/api` | Pass (`dist/index.js`, `dist/worker.js`) |
| Next.js production build (HTTPS example origins) | Pass |
| `expo export` Android | Pass |
| `expo export` iOS | Pass |
| `expo-doctor` | **20/20** |
| EAS cloud build / store submit | **Not run** |
| Live IPO Guru / live push | **Not run** |

Added: `apps/api/src/config/release-candidate.test.ts` (kill switches, 76A scopes, tunnel CORS, account delete + EAS profiles).

---

## 8. Monitoring & rollback pointers

Full procedures: `production-launch-runbook.md`, `production-deployment-readiness.md` §§12–15.\
Push incident first action: set `PUSH_DELIVERY_ENABLED=false`.

---

## 9. Candidate verdict

**Software release candidate for comprehensive manual testing: YES** (automated green + docs).\
**Git-immutable tagged RC: NO** until deliberate commit (RB-13).\
**Production launch: BLOCKED** (RB-01–10, store, physical QA).
