# Production readiness audit — Prompt 71

**Audit date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Entire IPO Singh monorepo after Prompts 1–70 — website, mobile (Expo), API, MongoDB/Redis, IPO Guru Pro, workers, auth, notifications, advertisements, Super Admin, shared packages.\
**Method:** Code inventory, contract/route/model cross-checks, defect fixes, then verification commands. Compilation alone is not treated as production-ready.

**Prompt 79 update:** Deployment order, env catalogue, rollback, and current go-live blockers live in [`production-deployment-runbook.md`](./production-deployment-runbook.md). Notification board policy: [`notifications-production.md`](./notifications-production.md).

Related (older) docs remain useful for history but may be stale vs this matrix: `docs/website-integration-audit.md`, `docs/public-website-readiness.md`, `docs/backend-readiness.md`, `docs/mobile-readiness.md`, `docs/accounts-admin-readiness.md`.

---

## Status legend

| Status | Meaning |
| --- | --- |
| **Implemented** | End-to-end path exists in code against real contracts/API; not a stub. |
| **Tested** | Automated tests exercise the behavior (unit/integration). Not a substitute for production soak or device QA. |
| **Partially implemented** | Real code exists but a gap, split wiring, env gate, or client surface is incomplete. |
| **Blocked** | Depends on external config, credentials, store IDs, or live vendor access not present in this audit. |
| **Not implemented** | No product surface, or schema-only without store/API/UI. |

---

## Verification evidence (this audit run)

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` (all workspaces) | Pass | `@ipo-singh/{api,web,mobile,contracts,core,design-tokens}` `tsc --noEmit` exit 0 |
| `npm run lint` | Pass | ESLint exit 0 for api, web, mobile |
| `npm test -w @ipo-singh/api` | Pass | **247** tests, **0** fail, **0** skipped (connectivity suite present but skipped only when env unset; this run reported skipped 0 for the default suite filter) |
| `npm test -w @ipo-singh/web` | Pass | **83** tests, **0** fail |
| `npm test -w @ipo-singh/mobile` | Pass | **110** tests, **0** fail |
| Packages tests | Pass | contracts **15**, core **32**, design-tokens **2** |
| `npm run build -w @ipo-singh/web` | Pass | Next.js production build; routes include Mainboard/SME/detail/admin/BFF |
| `npm run build -w @ipo-singh/api` | Pass | esbuild `dist/index.js` + `dist/worker.js` |
| Live IPO Guru connectivity | Not exercised | Requires `IPOGURU_CONNECTIVITY_TEST=1` + key/budgets (`apps/api/src/providers/ipo-guru/connectivity.test.ts`) |
| MongoMemoryServer in sandbox | Env-sensitive | Earlier sandbox run hit `UnexpectedCloseError` code 48; full permissions re-run: API suite green including persistence/promotions image storage |
| Deploy | **Not done** | Out of scope |

### Defects fixed during this audit

| Defect | Fix | Files |
| --- | --- | --- |
| Admin allotment UI could not reach API via web BFF | Allowlist GET/POST allotment-verification suffixes | `apps/web/lib/admin/proxy.ts`, `proxy.test.ts` |
| Article admin `router.use(protect)` returned **403** for unknown `/api/v1/admin/*` (e.g. `/users`) instead of falling through to **404** | Per-route `gate` only | `apps/api/src/content/admin-routes.ts` |
| Web IPO journey hard-coded `allotmentConfirmed: false` | Pass `ipo.allotmentConfirmed === true` | `apps/web/features/ipo-details/timeline-section.tsx` |
| Web vs mobile lifecycle badge casing drift | Align to **Allotment Awaited / Allotment Out** | `apps/web/features/ipos/labels.ts`, dashboard/allotment UI |
| Mobile lifecycle helpers existed but were not applied on catalogue loads | Apply `refreshSummaryLifecycle` / `refreshIpoLifecycle` on list + issue paths | `apps/mobile/src/catalogue/listings.ts`, `load.ts` |
| Stale catalogue-sync assertions (Upcoming→Open on open day; allotment filter after +4d) | Expectations match `resolveIpoLifecycle`; order-independent assert | `apps/api/src/jobs/catalog-sync.test.ts` |

---

## Feature matrix

### Shared packages

| Feature | Status | Evidence |
| --- | --- | --- |
| `@ipo-singh/contracts` Zod shapes (IPO, board, status, auth, admin, watchlist, notifications, promotions) | Implemented + Tested | `packages/contracts/src/*`; 15 package tests |
| `@ipo-singh/core` lifecycle, journey, money/IST formatters, registrar directory | Implemented + Tested | `packages/core/src/lifecycle.ts`, `journey.ts`; 32 package tests |
| Design tokens / Growth Arrow Green | Implemented + Tested | `packages/design-tokens`; theme CSS test |
| Invented sample production data in packages | Not implemented (correct) | Fixtures are test-only; no fabricated live catalogue |

### API — catalogue & IPO Guru

| Feature | Status | Evidence |
| --- | --- | --- |
| Public catalogue routes (`/ipos`, search, calendar, detail, gmp/subscription history, financials, registrar) | Implemented + Tested | `apps/api/src/modules/catalog/routes.ts`; catalog/present tests |
| Mainboard / SME from provider `type`, not issue size | Implemented + Tested | `providers/ipo-guru/catalog.ts` `boardOf`; catalog-sync stores both boards |
| Lifecycle Open / Upcoming / Closed / Allotment / Listed via `resolveIpoLifecycle` | Implemented + Tested | Core + `catalog.ts` `statusOf` + `modules/catalog/present.ts` |
| Allotment Out requires `allotmentConfirmed` | Implemented + Tested | Core comment + allotment jobs/notify tests |
| GMP current + history (units explicit; missing/zero/stale distinct) | Implemented + Tested | Provider GMP + catalog routes; gmp-sync/history tests |
| Subscription current + history | Implemented + Tested | subscription sync/tests |
| Financials, documents, anchors on detail sync | Implemented + Tested | detail sync + mongo-store; anchors in sync-service |
| Redis response cache + stampede control | Implemented + Tested | `cache/service.ts`, redis-store tests; optional without `REDIS_URL` |
| Mongo persistence for IPO catalogue | Implemented + Tested | `db/mongo-store.ts`, persistence integration tests (memory server) |
| OFS / unlisted shares product API | Not implemented | Models `ofs-issue.ts`, `unlisted-share.ts` indexed only; provider mappers exist; no public routes/store usage |
| Live IPO Guru Pro activation | Blocked | Needs production key, budgets, worker, Mongo/Redis; `docs/live-ipoguru-activation.md` |

### API — workers & allotment

| Feature | Status | Evidence |
| --- | --- | --- |
| Separate worker process (`dist/worker.js`) | Implemented | `apps/api/src/worker.ts`, build output |
| Catalog / GMP / subscription / detail / history sync plan | Implemented + Tested | `jobs/schedule.ts`, sync-service, focused job tests |
| Allotment verification adapters (KFin, MUFG, Bigshare) | Implemented + Tested | `jobs/allotment/adapters/*`, service/e2e tests |
| Allotment automation in production | Partially implemented / Blocked | Code ready; gated by `ALLOTMENT_VERIFY_*` env; staging verify is manual |
| Alert pass + push delivery | Implemented + Tested | `jobs/alert-pass.ts`, notifications engine/push tests |

### API — auth, watchlist, notifications, admin, ads, content

| Feature | Status | Evidence |
| --- | --- | --- |
| Cookie + bearer auth, CSRF on cookie mutations | Implemented + Tested | `accounts/*`, auth-routes/middleware tests |
| Watchlist account-scoped | Implemented + Tested | `watchlist/routes.ts` + tests |
| In-app notifications + push token registration | Implemented + Tested | `notifications/routes.ts`, push tests |
| Email / SMS alerts | Not implemented | Explicitly out of product; mobile/settings copy |
| Super Admin / admin roles, audit, dashboard, sync, provider | Implemented + Tested | `accounts/admin-routes.ts`, dashboard, admin-routes tests |
| Admin allotment verification API | Implemented + Tested | `accounts/admin-allotment.ts` |
| Banner promotions CRUD + public promotions + media | Implemented + Tested | `promotions/*`, mongo-store/image tests |
| Articles public + admin API | Implemented + Tested | `content/routes.ts`, `content/admin-routes.ts`, content tests |
| Articles Mongo store | Partially implemented | Falls back to in-memory seed when `database.articles` absent (`content/admin-routes.ts`) |

### Website (`apps/web`)

| Feature | Status | Evidence |
| --- | --- | --- |
| SSR Mainboard / SME / listed / detail / calendar / compare / search / allotment | Implemented + Tested | `app/(site)/*`, catalog load + browse tests; production build lists routes |
| Consistent IPO data via `@ipo-singh/contracts` + API origin (never IPO Guru from client) | Implemented + Tested | `lib/api/ipo-singh.ts` refuses vendor host; React.cache dedupe in `features/ipos/catalog.ts` |
| Client lifecycle refresh for stale Open | Implemented | `features/ipos/lifecycle.ts` applied in catalog loaders |
| Lifecycle labels Allotment Awaited / Out | Implemented | `features/ipos/labels.ts` + badges |
| Auth / account / watchlist / notifications (BFF cookies) | Implemented + Tested | BFF proxies + feature panels; proxy tests |
| Admin shell → dashboard, records, sync, cache, accounts, banners, provider, audit | Implemented | `app/admin/*`, `lib/admin/proxy.ts` allowlist |
| Admin allotment panel → API | Implemented (fixed) | Proxy allowlist + `allotment-panel.tsx` |
| Admin HTML without Next middleware | Partially implemented | Client gate + API 401/403; no `middleware.ts` |
| Public ads carousel + house fallback | Implemented + Tested | `features/promotions/*`, home-view |
| Blog | Partially implemented | Local seed articles (`features/blog/load.ts`); **not** wired to `/api/v1/articles` or admin CMS UI |
| `/gmp`, `/subscription` hub pages | Partially implemented | Intentional `PlaceholderPage`; excluded from primary nav; robots private paths |
| App store download CTA | Partially implemented | “Coming soon” when stores unpublished (`app-promo.ts`) |
| SEO sitemap/robots/structured data | Implemented + Tested | seo tests; `metadataBase` needs `IPO_SINGH_SITE_URL` |
| Playwright / browser E2E | Not implemented | Unit/integration only |

### Mobile (`apps/mobile`)

| Feature | Status | Evidence |
| --- | --- | --- |
| Expo Router tabs: Home, IPOs, Watchlist, Alerts, Settings | Implemented + Tested | `app/(tabs)/*`, navigation/preview tests |
| Mainboard / SME / detail / compare / allotment / calendar / news | Implemented | Screens under `app/` and `src/screens` |
| Shared contracts + SecureStore auth | Implemented + Tested | `auth/session.ts`, security tests |
| Guest browse; guest watchlist unsupported | Implemented + Tested | watchlist guest policy tests |
| Offline catalogue cache + in-flight dedupe | Implemented + Tested | `response-cache.ts`, listings tests |
| Client lifecycle refresh on catalogue loads | Implemented (fixed) + Tested | `catalogue/lifecycle.ts` wired in `listings.ts` / `load.ts` |
| Push notifications | Partially implemented / Blocked | Code + tests; needs physical device + EAS project; Expo Go limited |
| Promotions carousel + house banners | Implemented + Tested | `promotions/*` |
| Exchange field on detail | Not implemented | Always “Unavailable” in `detail/model.ts` |
| Store package identity | Blocked | Still `com.iposigh.mobile.dev` (`app.config.ts`); replace before store |
| Detox / device E2E in CI | Not implemented | Node unit tests only |

---

## Consistency checks (requirements 3–10)

| Requirement | Verdict | Notes |
| --- | --- | --- |
| Website and mobile use consistent IPO data | Pass (with caveats) | Same API + contracts; both apply `resolveIpoLifecycle` client-side after this audit |
| Mainboard / SME classification | Pass | Board enum + separate routes/tabs; API filters by stored board |
| Open / Upcoming / Allotment Awaited / Out / Listed | Pass | Core lifecycle; badges aligned Title Case; Allotment Out needs confirmation |
| GMP, subscription, financials, documents, anchors, history | Pass on detail | Web detail + mobile detail; standalone `/gmp`/`/subscription` hubs remain placeholders |
| Advertisement campaigns | Pass | Public + admin banners; analytics events aggregate-only on mobile |
| Notifications + watchlist | Pass | Web BFF + mobile direct API; guest watchlist intentionally off |
| Guest vs authenticated | Pass | Catalogue public; account features gated |
| Admin → correct backends | Pass after fix | Allotment BFF allowlisted; article admin no longer swallows unknown paths |

---

## Incomplete screens, placeholders, broken links

| Item | Kind | Notes |
| --- | --- | --- |
| `/gmp`, `/subscription` | Intentional placeholders | Point users to IPO lists; not in primary nav |
| Web blog | Seed-only | Split from articles API; no web admin articles UI |
| `/contact` | Partial static | Address/contact details not published yet (`InfoPage` copy) |
| Mobile Exchange | Unavailable | Documented gap (`detail/model.ts`) |
| App download / store IDs | Coming soon / `.dev` id | Blocked on store publishing |
| OFS / unlisted | Schema only | No product surface |
| Legacy mobile redirects | Safe aliases | `/(tabs)/account`, `/search`, `/notifications` redirect |

No primary-nav links to missing pages were found (`lib/navigation/routes.ts` matches existing `page.tsx` files).

---

## Duplicate API calls

| Surface | Behavior |
| --- | --- |
| Web listings | Summaries only via `loadListingSummaries`; `React.cache` wraps catalog loaders |
| Web home | Parallel section fetches (open/closed/upcoming/listed) + calendar + promotions — intentional, not N+1 detail |
| Legacy `loadBoardCatalog` hydrate | Still in codebase/tests; **not** used by browse/home |
| Mobile | `shareFlight` + memory/disk cache; history separate TTLs |
| API | Redis `getOrLoad` + provider gateway cache + quota |

---

## Production blockers (not claimed ready)

1. **Secrets & infra:** production `MONGODB_URI`, `REDIS_URL`, IPO Guru key/budgets, ops token, session secrets, `IPO_SINGH_SITE_URL` / HTTPS API origin for mobile.\
2. **Worker process** must run beside the API for sync, allotment, and alerts.\
3. **Mobile store cutover:** replace `.dev` application id; confirm EAS project; physical-device push smoke.\
4. **Blog/CMS:** decide seed vs `/api/v1/articles` wiring + admin UI.\
5. **Admin hardening:** optional Next middleware for `/admin` HTML (API already enforces roles).\
6. **Live vendor soak:** do not treat green CI as proof of live IPO Guru quota/health.

---

## Changed files (Prompt 71)

- `apps/web/lib/admin/proxy.ts` (+ tests) — allotment BFF allowlist\
- `apps/api/src/content/admin-routes.ts` — per-route admin protect\
- `apps/web/features/ipo-details/timeline-section.tsx` — real `allotmentConfirmed`\
- `apps/web/features/ipos/labels.ts`, `ipo-dashboard-card.tsx`, `allotment-section.tsx`, `allotment-board.tsx` — label parity\
- `apps/mobile/src/catalogue/listings.ts`, `load.ts`, `listings.test.ts` — lifecycle refresh on loads\
- `apps/api/src/jobs/catalog-sync.test.ts` — lifecycle-correct expectations\
- `docs/production-readiness-audit.md` — this report\

**Tests run:** typecheck, lint, full workspace unit/integration suites listed above, web + API production builds.\
**Issues found:** listed defects (fixed); remaining blockers above.\
**Next prerequisites:** production env + worker + mobile store identity + optional blog wiring; do not auto-start the next prompt.\
**Deploy:** none.
