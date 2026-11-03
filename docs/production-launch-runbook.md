# Production launch runbook — Prompt 85

**Date:** 3 November 2026 (Asia/Kolkata)\
**Scope:** Manual approval-gated launch sequence, monitoring thresholds, rollback.\
**Does not:** execute deploy, purchase, DNS, EAS, store submit, or enable production push.

Detailed hosting/env: `production-deployment-readiness.md`.\
Blockers: `release-blockers.md`.\
Manual QA: `final-manual-testing-checklist.md`.\
RC identity: `final-release-candidate.md`.

---

## 1. Approval gates (human only)

| Gate | Required before… | Approver notes |
| --- | --- | --- |
| G0 | Development complete + RC docs | Prompt 85 |
| G1 | Staging infra up (HTTPS API/web, Mongo, Redis, worker) | No tunnels |
| G2 | Physical Android + iOS QA PASS | Checklist §1–2 |
| G3 | Website + backend staging QA PASS | Checklist §3–4 |
| G4 | Optional staging push test complete; push **re-disabled** | Checklist §5 |
| G5 | Freeze RC tag (`v0.1.0-rc.1` or later) on clean commit | No auto-tag |
| G6 | Production secrets + Atlas + Redis + hosts configured | RB-01–05 |
| G7 | Deploy API + worker with **push off** | Smoke health/ready |
| G8 | Deploy website | SEO/canonical check |
| G9 | Production data accuracy spot-check | No fabricated values |
| G10 | Signed store builds + Play/ASC submission | Store docs |
| G11 | Production push enable | Explicit written approval |

---

## 2. Recommended launch sequence

1. Complete development (Prompt 85).\
2. Clear or accept open blockers in `release-blockers.md`.\
3. Configure **staging** infrastructure (API, worker, web, Mongo, Redis).\
4. Generate fresh Android preview APK + iOS device/TestFlight build pointing at staging HTTPS.\
5. Execute `final-manual-testing-checklist.md` on physical devices + website + backend.\
6. Controlled staging push test only with approval; then disable push.\
7. Fix confirmed bugs; re-run `npm run typecheck && npm run lint && npm test` and relevant builds.\
8. Commit, CI green, tag RC (`v0.1.0-rc.1`).\
9. Configure **production** infra (isolated DB/Redis; `IPO_SINGH_DEPLOYMENT=production`).\
10. Deploy API + worker with `PUSH_DELIVERY_ENABLED=false`, `ALLOTMENT_BROADCAST_ENABLED=false`, `ALLOTMENT_VERIFY_ENABLED=false`.\
11. Deploy website with production `IPO_SINGH_SITE_URL` / `IPO_SINGH_API_ORIGIN`.\
12. Smoke: health, ready, home SSR, one IPO detail freshness.\
13. Build production AAB/IPA via EAS (`production` profile); submit when listings ready.\
14. Monitor errors, Guru quota, worker sync for a soak period.\
15. Enable production notifications **only** after G11.\
16. Expand rollout (Play staged track / TestFlight → production) cautiously.

Do not skip G2/G3 before G7.

---

## 3. Monitoring (simple launch set)

Prefer free/low-cost uptime checks + host logs + ops status. Do not create paid accounts from this repo.

| Signal | Probe | Alert when | First action |
| --- | --- | --- | --- |
| Website | HTTPS `/` | 2 min failure | Rollback web deploy / DNS |
| API health | `/api/v1/health` | 2 min failure | Restart API; check host |
| API ready | `/api/v1/ready` | Mongo not ok 2 min | Atlas status; stop assuming cache |
| API errors | 5xx rate | >5% for 5 min | Rollback API; check logs |
| Worker | Process up + ops sync success | Gap > 3× GMP interval | Restart worker; check Redis locks |
| Guru quota | Ops counters | >80% daily budget | Lengthen sync intervals; pause noncritical jobs |
| Push (if on) | Expo failures | >10% attempts | `PUSH_DELIVERY_ENABLED=false` |
| Auth | Failed login spikes | Sudden 10× baseline | Confirm not attack; tighten rate limits |
| Mobile crashes | Play/ASC crash reports | New crash cluster post-release | Halt rollout; OTA if JS-only and runtime matches |

---

## 4. Rollback and recovery

### Website
- Redeploy previous Vercel/Netlify deployment or prior artifact from RC tag.\
- Restore env (`IPO_SINGH_SITE_URL`, `IPO_SINGH_API_ORIGIN`).

### API
- Redeploy previous `dist`/image for the last good tag.\
- Restart; confirm `/health` and `/ready`.\
- Env mistakes: revert secrets in host UI; do not commit secrets.

### Database
- Prefer Atlas snapshot restore to a **new** DB, validate, then cut over with a written plan.\
- Never restore production over staging casually.\
- App has no destructive auto-migration in launch path; indexes via models.

### Workers
- Stop worker process to halt scheduling.\
- Redis locks fail closed — safe to stop mid-tick.\
- Resume one worker first; confirm single lock holder.

### Notifications
- Immediate: `PUSH_DELIVERY_ENABLED=false` and `ALLOTMENT_BROADCAST_ENABLED=false`.\
- Investigate tickets/receipts; clean invalid tokens.\
- Deduped notification rows prevent most duplicate content; do not “resend all”.

### Mobile
- Native binaries **cannot** always roll back remotely.\
- EAS Update: only for JS changes sharing the same `runtimeVersion` (`appVersion` policy).\
- Breaking native/SDK changes require a new Play/App Store build.\
- Halt staged rollout in store consoles if crash rate spikes.

---

## 5. App-store prerequisites (checklist)

| Item | Android | iOS |
| --- | --- | --- |
| Developer account | Play Console | Apple Developer Program |
| Application id | `com.iposigh.mobile` (or approved rename) | Same pattern |
| Privacy policy URL (https) | Required | Required |
| Account deletion | In-app + API | In-app + API |
| Store listing assets | Feature graphic, screenshots | Screenshots, description |
| Signing | EAS credentials | EAS + APNs for push |
| Tracks | Internal → closed → production | TestFlight → App Store |
| Push live | After G11 | After G11 + APNs |

Details: `android-play-store-readiness.md`, `ios-app-store-readiness.md`.

---

## 6. Commands (repository-supported)

```bash
# Verify
npm ci
npm run typecheck
npm run lint
npm test
npm run build -w @ipo-singh/api
IPO_SINGH_SITE_URL=https://CANONICAL_SITE IPO_SINGH_API_ORIGIN=https://CANONICAL_API \
  npm run build -w @ipo-singh/web

# Runtime (after host env configured — do not run against production from this prompt)
npm run start -w @ipo-singh/api
npm run start:worker -w @ipo-singh/api
npm run start -w @ipo-singh/web
```

EAS builds and submits are **manual** via Expo CLI when authorized — not automated here.

---

## 7. Post-launch first 48 hours

- Watch Guru daily quota before market open IST.\
- Confirm worker heartbeat after deploys.\
- Keep push off until G11; if enabled, watch complaint volume and disable first.\
- Do not run historical backfills that burn the day budget.
