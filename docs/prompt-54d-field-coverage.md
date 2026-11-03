# Prompt 54D — IPO Guru field coverage (audit)

Audit date: 29 October 2026. Sources: IPO Guru v2 docs (`docs/ipoguru-field-mapping.md`), provider mappers under `apps/api/src/providers/ipo-guru/`, Mongo records, IPO Singh public API presentation, and live UI checks for representative October 2026 issues.

Secrets and full vendor payloads are not logged here.

## Representative issues checked

| IPO | Role |
| --- | --- |
| EAAA India Alternatives | Open→allotment lifecycle; after bounded detail sync: about, strengths, docs, financials, MUFG portal |
| BLS Polymers | Last Day / open; subscription categories; KFin portal; about + financials |
| SFC Environmental / M.K.Sons / Bombay Coated | Active October 2026 enrichment sample |

Verified after bounded `sync:once` passes on 29 Oct 2026 (not a full catalogue backfill): **14** active/recent issues received `details_full` enrichment (`IPO detail finished` in worker log). Sample check of those 14: about 14/14, source financials 14/14, registrar 14/14, documents 4/14 (only when the provider supplied verified links).

## Coverage matrix (high level)

| Domain field | In provider (details_full / gmp / subscription) | Stored in Mongo | Returned by IPO Singh API | Shown in UI | Gap |
| --- | --- | --- | --- | --- | --- |
| Lifecycle status | Vendor `Upcoming`/`Open`/`Closed` + `is_listed` | `ipos.status` | Yes (now date-resolved on read) | Yes | **Was** trusting stale vendor `Open` after close date |
| Open/close/allotment/listing dates | Yes | Yes | Yes | Yes | None |
| Official close clock | Not consistently published as a verified instant | Not stored | N/A | N/A | Calendar-day fallback documented |
| GMP amount / % / observedAt | Yes (`gmp`) | Yes | Yes | Yes (GMP*) | Delayed threshold fixed to >24h |
| Subscription totals + categories | Yes | Yes when synced | Yes when present | Partial; empty rows were noisy | Prefer sparse breakdown |
| Subscription history | Yes (`subscription_history`) | When history sync runs | Detail endpoints | Charts when loaded | Needs recurring worker |
| Company about / strengths / risks / promoters | `details_full.company` | `ipos.profile` when detail sync runs | Yes | About section | Empty until detail sync |
| Financial statements | `details_full` financials | `financials` + profile source tables | Yes | Financials section | Empty until detail sync |
| Registrar name / status_page | `contacts.registrar` | `registrars` when detail sync links `registrarId` | Yes when linked | Allotment | Many catalogue rows lacked registrar until detail sync + directory portal |
| Documents (DRHP/RHP/BOA) | `documents` object | `sources` | Yes | Documents | Empty until detail sync; only verified URLs kept |
| Listing price / issue price | Listing block | `ipos.listing` | Yes | Recently listed cards | None when stored |
| Allotment confirmed | No structured “results out” flag | Not auto-set | `allotmentConfirmed` optional | Allotment Out | Requires evidence worker / admin audit |

## Mapping gaps explained

1. **Stale Open** — `statusOf` mapped vendor `Open` literally. Presentation now runs `resolveIpoLifecycle` so EAAA on 29 Oct 2026 with close 28 Oct becomes `allotment` / Allotment awaited without waiting for sync.
2. **Empty About / financials / documents** — Mapped in `detail.ts`, but only populated after a bounded `details_full` sync. Catalogue sync alone does not fetch full company blocks.
3. **Registrar missing on cards** — Catalogue joins registrars by id; `verifiedAllotmentUrl` prefers a valid vendor `status_page`, otherwise a verified **general** portal from the registrar directory when identity matches uniquely (not an invented IPO-specific URL).
4. **Allotment Out** — Vendor does not publish a trustworthy results-published boolean. Automation stays unconfirmed unless audited evidence is stored.
5. **Company contacts / industry / KPIs** — Present in some `details_full` payloads per IPO Guru docs, but intentionally unmapped into domain fields (except registrar). Holding pattern and SME `kpis` stay empty by source.
6. **Subscription history / full company blocks** — Require bounded detail/history sync jobs; catalogue sync alone leaves About, financials, and documents empty.

## Sync worker note

The recurring worker is a separate process (`npm run start:worker -w @ipo-singh/api`). It does not start with the API. If the MacBook is off, no polls run unless a hosted worker is deployed.
