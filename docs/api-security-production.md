# API production security and reliability

**Prompt:** 75\
**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** `apps/api` authentication, authorization, validation, rate limits, CORS/headers, sessions, SSRF surfaces, uploads, logging, timeouts/shutdown, dependency review.\
**Does not:** deploy, change production DNS, or run intrusive tests against third-party systems.

---

## 1. Summary

The API already had a solid baseline: opaque hashed sessions (not JWT bearer secrets in DB), cookie CSRF, role gates, Helmet + HSTS in production, CORS allowlist, Zod validation on account/admin/notification writes, PAN rejection, redacted errors, request timeouts, and graceful shutdown.

Prompt 75 hardened remaining gaps around **public HTTPS destination/SSRF boundaries**, **anonymous push-token ownership**, and **auth-budget rate limits for device push**, then recorded residual risks below.

---

## 2. Requirement matrix

| # | Area | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Auth middleware | OK | `accounts/middleware.ts` — optional auth, CSRF on cookie mutations, `requireAccount` / `requireRole` |
| 2 | Super Admin endpoints | OK | `admin-routes.ts` gates; staff cannot hit provider/audit/roles/sync POST; regression in `admin-routes.test.ts` + anonymous 401 in `security.integration.test.ts` |
| 3 | Guest / anonymous push | Hardened | Device routes are intentional; anon cannot steal active user tokens (`push-tokens.ts`); auth-budget rate limit |
| 4 | Rate limiting | OK + hardened | Per-IP buckets; auth/admin tighter; device-push uses auth budget |
| 5 | Payload validation | OK | Zod on auth/admin/notifications/promotions; express JSON size limit; `rejectPrivateRequestBody` |
| 6 | NoSQL injection | OK | Mongoose filters built from typed fields/ids; `query parser: simple`; no `$where` from input |
| 7 | CORS | OK | Explicit origin set + credentials; native-only headers not opened (`cors.ts`) |
| 8 | HTTPS / secure headers | OK | Helmet CSP deny-by-default; HSTS when `NODE_ENV=production`; secure cookies in production |
| 9 | Session expiry / rotation / revoke | OK | Opaque tokens, hashed at rest, TTL, refresh rotation with reuse revoke (`session-service.ts`) |
| 10 | Secrets server-side | OK | `opsToken` non-enumerable; IPO Guru creds never on public routes; error redaction |
| 11 | SSRF / external URLs | Hardened | `public-https-url.ts`; banner destinations; registrar fetch manual redirects; KFin bundle host pin |
| 12 | Uploads / object storage | OK (Mongo) | Image magic-byte inspect, 800KB cap, admin-only; **no R2 yet** |
| 13 | Log / error leakage | OK | Production Zod messages generic; `redactString` on 5xx logs; PAN stripped from query/body |
| 14 | Timeouts / shutdown | OK | `requestTimeout` / headers / keep-alive; `createShutdown` + SIGTERM/SIGINT |
| 15 | Dependencies | Residual | See §5 (`zod` advisory) |

---

## 3. Changes in Prompt 75

| Change | Why |
| --- | --- |
| `shared/public-https-url.ts` | Shared blocklist for private/link-local/metadata/vendor hosts |
| `promotions/destination.ts` | Sponsored links must be public https |
| `jobs/allotment/fetch.ts` | Manual redirects; refuse blocked hop targets |
| `jobs/allotment/adapters/kfin.ts` | Main JS bundle must stay on `*.kfintech.com` |
| `middleware/rate-limit.ts` | `/notifications/device-push-*` share auth budget |
| `notifications/push-tokens.ts` | Anonymous registration cannot take over active user tokens |
| Regression tests | destination, public URL, fetch, push ownership, admin 401, device-push 429 |

---

## 4. Verification

| Check | Result |
| --- | --- |
| Security-focused `npm test -w @ipo-singh/api` (auth, middleware, security integration, push, destination, fetch, allotment adapters, ops) | **48 pass / 0 fail** |
| `npm run typecheck -w @ipo-singh/api` | Pass |
| `npm run lint -w @ipo-singh/api` | Pass |
| `npm audit --omit=dev -w @ipo-singh/api` | 1 high (`zod` — see unresolved) |
| Intrusive third-party probes | **Not run** |

---

## 5. Unresolved / residual risks

1. **Zod GHSA-mrhx-c7xc-m3w5 (high)** — Workspace packages pin `zod@^3.25.76`. The published fix is **Zod 4.6.6+** (breaking). Mitigations already in place: small JSON body limits, capped arrays in schemas, production generic validation messages. **Do not** `npm audit fix --force` without a coordinated Zod 4 migration across `contracts` + `api` + tests.

2. **In-process rate limiter** — Buckets are per Node process memory, not Redis. Multi-instance production needs an edge/WAF or shared store to enforce global ceilings.

3. **Anonymous Expo push tokens** — Still a shared-secret channel. Ownership hardening and auth-budget limits reduce abuse; physical token disclosure remains a mobile-platform residual.

4. **No Cloudflare R2 / S3 yet** — Banner bytes live in Mongo with admin auth + type sniffing. When R2 is introduced: private buckets, short-lived signed GET/PUT, no public write ACLs, malware scanning as needed.

5. **TLS termination** — API HSTS assumes HTTPS at the edge. Configure the reverse proxy/load balancer for TLS 1.2+ and HTTP→HTTPS redirect; do not expose plain HTTP publicly.

6. **Registrar HTML/JS scraping** — Company lists come from official portals with host checks. Portal markup changes can break adapters; they must fail closed (already the design) rather than invent companies.

7. **Ops token** — Powerful read of operational status / IPO Guru account view. Keep `OPS_TOKEN` long, unique, rotated, and never logged. Missing/wrong token still returns **404** (not 401) to avoid oracle behaviour.

---

## 6. Production configuration checklist (no deploy in this prompt)

```text
NODE_ENV=production
CORS_ORIGINS=https://www.example.com
TRUST_PROXY=1          # only behind a trusted edge
OPS_TOKEN=<16–128 url-safe chars>
# session cookies already Secure when NODE_ENV=production
REQUEST_BODY_LIMIT=…  # keep modest
RATE_LIMIT_AUTH=…     # covers login + device-push
```

Leave IPO Guru credentials only on the API/worker host. Never send them to web or mobile clients.

---

## 7. Next prerequisites (approval required)

- Coordinate Zod 4 upgrade or accept documented residual until then.
- Decide Redis/edge rate limiting before multi-instance launch.
- When adding object storage, write an R2 permission design before wiring uploads.
- Deploy and edge TLS only with explicit approval (this prompt does not deploy).
