# Production deployment runbook — Prompt 79

**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** End-to-end production readiness documentation for website, API, worker, MongoDB, Redis, IPO Guru, Expo mobile, notifications.\
**Does not:** deploy, send live pushes, publish store builds, or flip production kill switches.

Companion docs: `production-deployment-readiness.md` (Prompt 84 architecture and hosting), `final-release-readiness.md` (Prompt 80 gate), `api-security-production.md`, `database-redis-production.md`, `notifications-production.md`, `ipo-data-sync-production.md`, `website-seo-launch.md`, `mobile-release-eas.md`, `allotment-automation-final.md`, `live-ipoguru-activation.md`.

---

## 1. Production readiness findings (summary)

| Area | Status | Notes |
| --- | --- | --- |
| Website (Next.js SSR, SEO, Mainboard/SME) | Ready for deploy **after** `IPO_SINGH_SITE_URL` + HTTPS API origin | Sitemap/robots/structured data coded; rankings not guaranteed |
| API security baseline | Ready | Opaque sessions, CSRF, roles, Helmet, CORS allowlist, Zod, rate limits (Prompt 75) |
| Mongo / Redis | Ready with isolation rules | Non-prod DB names must include `dev`/`test`/`staging`; prod workers require Redis |
| IPO Guru sync | Ready when key + budgets set | Mock refused in production; quotas/schedules documented |
| Notifications (76A) | Ready **disabled** | Mainboard global / SME watchlist; `PUSH_DELIVERY_ENABLED` + `ALLOTMENT_BROADCAST_ENABLED` default off |
| Mobile | Preview config ready; store cutover blocked | Production package `com.iposigh.mobile`; on-device crash retest still required |
| Admin | API-enforced | Optional Next HTML middleware still optional |

**Verdict:** **NOT READY TO GO LIVE** until secrets, infra, worker, kill-switch approvals, and mobile physical retest are completed. Code and docs are production-*preparable*.

---

## 2. Environment variable catalogue (names only — never commit values)

### Website (`apps/web`)

| Variable | Required in prod | Purpose |
| --- | --- | --- |
| `IPO_SINGH_SITE_URL` | Yes | `metadataBase`, canonicals, sitemap, structured data (https, no path) |
| `IPO_SINGH_API_ORIGIN` | Yes | Server-side IPO Singh API (https; never IPO Guru) |
| `IPO_SINGH_PLAY_STORE_URL` | Optional | App promo; leave empty until listed |
| `IPO_SINGH_APP_STORE_URL` | Optional | App promo |

### API + worker (`apps/api`)

| Variable | Required in prod | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables HSTS path, rejects mock provider, ignores local `.env` for Mongo load rules |
| `HOST` / `PORT` | Yes | Bind |
| `CORS_ORIGINS` | Yes | Exact https website origin(s); no `*`; no tunnels |
| `IPO_SINGH_DEPLOYMENT` | `production` or `staging` | Staging must set this when `NODE_ENV=production` |
| `TRUST_PROXY` | Provider-specific | Default false; when true, Express trusts one hop only |
| `OPS_TOKEN` | Strongly recommended | `/internal/status`; missing → dark 404 |
| `MONGODB_URI` | Yes | Dedicated prod DB path |
| `REDIS_URL` | Yes for **workers** | Locks + quotas; recommended for API cache |
| `IPO_DATA_PROVIDER` | `ipo-guru` when syncing | `mock` refused in production |
| `IPOGURU_ENABLED` / `IPOGURU_API_KEY` / budgets | When live sync | Server-only; never `EXPO_PUBLIC_` / `NEXT_PUBLIC_` |
| `PUSH_DELIVERY_ENABLED` | Default **false** | Expo send/receipts |
| `ALLOTMENT_BROADCAST_ENABLED` | Default **false** | Confirmed allotment queue (board-scoped) |
| `ALLOTMENT_VERIFY_ENABLED` | Default **false** | Registrar polling |
| `ALERT_*` / `EXPO_PUSH_ACCESS_TOKEN` | As needed | Alerts + Expo; leave token unset until approved |
| Session / bootstrap admin | Per auth docs | Bootstrap email/password optional once |

Full commented list: `apps/api/.env.example`.

### Mobile (`apps/mobile` / EAS env)

| Variable | Preview | Production |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | `preview` | `production` |
| `EXPO_PUBLIC_IPO_SINGH_API_ORIGIN` | Stable https staging API | Stable https production API |
| `EXPO_PUBLIC_IPO_SINGH_SITE_URL` | https site | https site |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | From `eas init` | Same project |

**Forbidden:** Cloudflare quick-tunnel hosts, IPO Guru hosts, Mongo/Redis/admin secrets as `EXPO_PUBLIC_*`.

---

## 3. Security findings (severity)

| Severity | Issue | Mitigation / status |
| --- | --- | --- |
| High (deferred) | Zod GHSA → fix in Zod 4.x breaking | Body size limits + generic prod validation messages; no force-upgrade |
| Medium | In-process rate limits | Edge/WAF or shared store for multi-instance |
| Medium | Anonymous push token channel | Ownership checks + auth-budget rate limit (Prompt 75) |
| Low | Admin HTML without Next middleware | API still 401/403; optional HTML gate |
| Info | TLS termination at edge | Configure reverse proxy; API HSTS when `NODE_ENV=production` |

No new critical unauthenticated admin/catalogue-write holes found in this audit pass.

---

## 4. Notification production safety (76A)

| Rule | Enforcement |
| --- | --- |
| Mainboard → opted-in, no watchlist | `eligibility.ts` + engine Mainboard owner fan-out |
| SME → watchlist only (incl. Allotment Out) | Engine SME path + `allotment/notify.ts` final gate |
| Close hour | Only if `ALERT_IPO_CLOSE_HOUR_IST` set |
| Kill switches | `PUSH_DELIVERY_ENABLED=false`, `ALLOTMENT_BROADCAST_ENABLED=false` until approval |
| Verification | Mocked Expo only — **no real sends in this prompt** |

---

## 5. Deployment order

1. **Prepare secrets** in the secret manager / host env (not git).\
2. **MongoDB:** create prod cluster/DB; ensure indexes via app boot / `ensureIndexes` path used in staging.\
3. **Redis:** dedicated instance or DB index for production.\
4. **Deploy API** (`dist/index.js`) with kill switches **off**, Guru disabled or budgets confirmed.\
5. **Smoke** `GET /api/v1/health` and `GET /api/v1/ready` (DB up).\
6. **Deploy worker** (`dist/worker.js`) with same Mongo/Redis; Redis required.\
7. **Enable IPO Guru** only after budgets set (`IPOGURU_ENABLED=true`).\
8. **Deploy website** with `IPO_SINGH_SITE_URL` + API origin.\
9. **Smoke** home, Mainboard, SME, one IPO detail, sitemap, robots.\
10. **Mobile:** new preview APK for crash retest; production AAB/IPA only after store ids + physical QA.\
11. **Push:** keep disabled until single-device approval.

Do **not** point staging at production Mongo/Redis. Do **not** use a temporary tunnel as production API origin.

---

## 6. Smoke tests (post-deploy, manual)

| Check | Expect |
| --- | --- |
| `/api/v1/health` | 200, no secrets |
| `/api/v1/ready` | database ok |
| `/internal/status` without token | 404 |
| Public IPO list Mainboard/SME | Stored data or empty — never invented |
| Admin without session | 401/403 |
| Website `/robots.txt`, `/sitemap.xml` | Valid; sitemap uses site URL |
| Worker logs | Locks acquired; no Expo calls while push disabled |

---

## 7. Monitoring

- Ops status (`OPS_TOKEN`): alerts + push counters, sync health\
- Provider usage / quota dashboards\
- Mongo Atlas alerts; Redis memory/eviction\
- Edge 5xx / latency\

---

## 8. Rollback

| Layer | Action |
| --- | --- |
| Kill switches | Set `PUSH_DELIVERY_ENABLED=false`, `ALLOTMENT_BROADCAST_ENABLED=false`, `ALLOTMENT_VERIFY_ENABLED=false`, `IPOGURU_ENABLED=false`; restart worker |
| Website | Redeploy previous build / revert CDN |
| API / worker | Redeploy previous `dist` artifact; keep Mongo schema backward-compatible |
| Mobile OTA | Republish prior update on channel **or** force native rollback binary |
| Bad confirmation | Admin allotment tools; do not wipe prod DB from staging scripts |

Incident: disable broadcasts first, then stop registrar verify, then pause Guru if quota/abuse.

---

## 9. Remaining manual configuration

1. Production Mongo + Redis + TLS edge\
2. `CORS_ORIGINS`, `OPS_TOKEN`, session secrets, site/API HTTPS URLs\
3. IPO Guru key + minute/day budgets matching plan\
4. Expo / FCM / APNs credentials (when push approved)\
5. Apple Developer + Play Console for store builds\
6. Physical Android retest of IPO detail crash (Prompt 78)\
7. Explicit approval before enabling push or allotment broadcast\

---

## 10. Release blockers

1. Secrets and dedicated prod infra not provisioned in this prompt\
2. Push and allotment broadcast must stay off until approved\
3. Mobile on-device crash verification incomplete\
4. Store package / Apple enrollment incomplete\
5. Zod major upgrade deferred\
6. No automatic deploy performed\

### Verification evidence (Prompt 79)

| Check | Result |
| --- | --- |
| Workspace typecheck | Pass |
| ESLint api/web/mobile | Pass |
| API unit/integration | **280** pass |
| Web unit | **91** pass |
| Mobile unit | **116** pass |
| Contracts / core / design-tokens | **15** / **32** / **2** pass |
| `npm run build -w @ipo-singh/api` | Pass (`dist/index.js`, `dist/worker.js`) |
| `npm run build -w @ipo-singh/web` | Pass (Mainboard/SME/detail/sitemap/robots) |
| Live push / deploy | **Not run** |

**Production readiness verdict: BLOCKED for go-live; READY for staging soak once secrets and HTTPS origins exist.**
