import { registrarEntryForName, resolveIpoLifecycle, istCalendarDate, verifiedAllotmentUrl } from "@ipo-singh/core";
import type { CacheService } from "../../cache/service.ts";
import type { PersistenceStore } from "../../db/repositories.ts";
import type { SyncLock } from "../lock.ts";
import type { Logger } from "../../shared/logger.ts";
import { createAllotmentVerifiers, resolveVerifierId } from "./adapters/index.ts";
import type { PublishedCompany } from "./company-list.ts";
import type { AllotmentNotifyResult } from "./notify.ts";
import type { AllotmentVerificationStore, StoredAllotmentVerification } from "./records.ts";
import { defaultAllotmentVerifyPolicy, planAllotmentCheck, type AllotmentVerifyPolicy } from "./schedule.ts";
import type {
  AllotmentAdapterResult,
  AllotmentNotificationDispatch,
  AllotmentVerificationRecord,
  AllotmentVerifyIssue,
  AllotmentVerifier,
} from "./types.ts";
import { adminConfirmAllotment as adminConfirmShape, unsupportedAllotmentVerification } from "./shapes.ts";

export type AllotmentConfirmNotifier = (input: {
  ipoId: string;
  companyName: string;
  slug?: string;
  board?: "mainboard" | "sme" | null;
  now: Date;
}) => Promise<AllotmentNotifyResult | AllotmentNotificationDispatch>;

export type AllotmentVerifyPassResult = {
  checked: number;
  confirmed: number;
  unsupported: number;
  errors: number;
  skipped: number;
};

function toStored(record: AllotmentVerificationRecord): StoredAllotmentVerification {
  return {
    ipoId: record.ipoId,
    registrarId: record.registrarId,
    verificationStatus: record.verificationStatus,
    allotmentConfirmed: record.allotmentConfirmed,
    verificationSource: record.verificationSource,
    verificationEvidence: record.verificationEvidence,
    verificationMethod: record.verificationMethod ?? null,
    sourceUrl: record.sourceUrl ?? null,
    matchedCompanyId: record.matchedCompanyId ?? null,
    verifiedAt: record.verifiedAt,
    monitoringStartedAt: record.monitoringStartedAt ?? null,
    lastCheckedAt: record.lastCheckedAt,
    nextCheckAt: record.nextCheckAt,
    note: record.note,
    notificationDispatch: record.notificationDispatch ?? "not-sent",
    notificationEligibleDevices: record.notificationEligibleDevices ?? null,
    notificationAccepted: record.notificationAccepted ?? null,
    notificationRejected: record.notificationRejected ?? null,
    errorName: record.errorName ?? null,
  };
}

function fromAdapter(input: {
  ipoId: string;
  result: AllotmentAdapterResult;
  nextCheckAt: string | null;
  monitoringStartedAt: string | null;
  notificationDispatch?: AllotmentNotificationDispatch;
}): AllotmentVerificationRecord {
  const confirmed = input.result.outcome === "confirmed";
  return {
    ipoId: input.ipoId,
    registrarId: input.result.registrarId,
    verificationStatus: confirmed
      ? "confirmed"
      : input.result.outcome === "unsupported"
        ? "unsupported"
        : input.result.outcome === "error"
          ? "failed"
          : input.result.outcome === "inconclusive"
            ? "inconclusive"
            : "unconfirmed",
    allotmentConfirmed: confirmed,
    verificationSource: input.result.method,
    verificationEvidence: input.result.evidence,
    verificationMethod: input.result.method,
    sourceUrl: input.result.sourceUrl,
    matchedCompanyId: input.result.matchedCompanyId,
    verifiedAt: confirmed ? input.result.observedAt : null,
    monitoringStartedAt: input.monitoringStartedAt,
    lastCheckedAt: input.result.observedAt,
    nextCheckAt: confirmed ? null : input.nextCheckAt,
    note: input.result.note,
    notificationDispatch: input.notificationDispatch ?? "not-sent",
    notificationEligibleDevices: null,
    notificationAccepted: null,
    notificationRejected: null,
    errorName: input.result.outcome === "error" ? "AllotmentVerifyError" : null,
  };
}

function normalizeNotifyResult(
  value: AllotmentNotifyResult | AllotmentNotificationDispatch,
): AllotmentNotifyResult {
  if (typeof value === "string") return { dispatch: value, eligibleDevices: 0, queuedUsers: 0 };
  return value;
}

export function identifyRegistrar(input: {
  registrarId: string | null;
  registrarName: string | null;
  allotmentUrl: string | null;
}): { registrarId: string | null; portalUrl: string | null } {
  const entry =
    registrarEntryForName(input.registrarName) ??
    registrarEntryForName(input.registrarId) ??
    null;
  const portal =
    verifiedAllotmentUrl({ name: input.registrarName, slug: input.registrarId, statusPage: input.allotmentUrl }) ??
    entry?.portalUrl ??
    null;
  return { registrarId: entry?.id ?? input.registrarId, portalUrl: portal };
}

export async function applyAllotmentConfirmation(input: {
  store: PersistenceStore;
  verifications: AllotmentVerificationStore;
  cache?: Pick<CacheService, "invalidateAfterSync"> | null;
  issue: AllotmentVerifyIssue;
  record: AllotmentVerificationRecord;
  notifier?: AllotmentConfirmNotifier | null;
  now: Date;
}): Promise<AllotmentVerificationRecord> {
  if (input.issue.listingConfirmed || input.issue.status === "listed") {
    return {
      ...input.record,
      allotmentConfirmed: false,
      verificationStatus: "unconfirmed",
      note: "Listed IPOs are not moved backwards into allotment confirmation.",
      nextCheckAt: null,
    };
  }
  let notificationDispatch: AllotmentNotificationDispatch = input.record.notificationDispatch;
  let notificationEligibleDevices = input.record.notificationEligibleDevices;
  const existing = await input.verifications.findByIpo(input.issue.ipoId);
  if (existing?.allotmentConfirmed) {
    // Never regress a confirmed allotment; keep the first confirmation evidence.
    return { ...existing };
  }
  if (input.record.allotmentConfirmed) {
    const ipo = await input.store.ipos.findById(input.issue.ipoId);
    if (ipo && ipo.status !== "listed") {
      await input.store.ipos.upsert({
        ...ipo,
        status: ipo.status === "open" || ipo.status === "upcoming" ? ipo.status : "allotment",
        allotmentConfirmed: true,
        allotmentConfirmedAt: input.now,
      });
    }
    if (input.notifier) {
      const notified = normalizeNotifyResult(
        await input.notifier({
          ipoId: input.issue.ipoId,
          slug: input.issue.slug,
          companyName: input.issue.companyName,
          board: ipo?.board === "mainboard" || ipo?.board === "sme" ? ipo.board : null,
          now: input.now,
        }),
      );
      notificationDispatch = notified.dispatch;
      notificationEligibleDevices = notified.eligibleDevices;
    } else {
      notificationDispatch = "skipped";
    }
    await input.cache?.invalidateAfterSync("issue", input.issue.slug);
    await input.cache?.invalidateAfterSync("listings", "catalogue");
    await input.cache?.invalidateAfterSync("listings", "catalogue-facts");
  }
  const saved = await input.verifications.upsert(
    toStored({
      ...input.record,
      notificationDispatch,
      notificationEligibleDevices,
    }),
  );
  return { ...saved };
}

export async function runAllotmentVerificationPass(input: {
  store: PersistenceStore;
  verifications: AllotmentVerificationStore;
  locks: SyncLock;
  cache?: Pick<CacheService, "invalidateAfterSync"> | null;
  logger: Logger;
  now?: () => Date;
  policy?: AllotmentVerifyPolicy;
  verifiers?: Record<string, AllotmentVerifier>;
  notifier?: AllotmentConfirmNotifier | null;
  stopped?: () => boolean;
}): Promise<AllotmentVerifyPassResult> {
  const now = input.now?.() ?? new Date();
  const policy = input.policy ?? defaultAllotmentVerifyPolicy;
  const verifiers = input.verifiers ?? createAllotmentVerifiers();
  const release = await input.locks.acquire("allotment-verify-pass", 60_000);
  if (!release) {
    input.logger.info("Allotment verification pass skipped; lock held");
    return { checked: 0, confirmed: 0, unsupported: 0, errors: 0, skipped: 1 };
  }
  const result: AllotmentVerifyPassResult = { checked: 0, confirmed: 0, unsupported: 0, errors: 0, skipped: 0 };
  try {
    const ipos = await input.store.ipos.list();
    const today = istCalendarDate(now) ?? "";
    const candidates: AllotmentVerifyIssue[] = [];
    for (const ipo of ipos) {
      if (input.stopped?.()) break;
      const company = await input.store.companies.findById(ipo.companyId);
      const registrar = ipo.registrarId ? await input.store.registrars.findById(ipo.registrarId) : null;
      const identified = identifyRegistrar({
        registrarId: ipo.registrarId,
        registrarName: registrar?.name ?? null,
        allotmentUrl: registrar?.allotmentUrl ?? null,
      });
      const prior = await input.verifications.findByIpo(ipo.id);
      const resolved = today
        ? resolveIpoLifecycle({
            today,
            openDate: ipo.dates.openDate,
            closeDate: ipo.dates.closeDate,
            allotmentDate: ipo.dates.allotmentDate,
            listingDate: ipo.dates.listingDate,
            providerStatus: ipo.status,
            listingConfirmed: ipo.status === "listed",
            allotmentConfirmed: ipo.allotmentConfirmed === true || prior?.allotmentConfirmed === true,
          })
        : null;
      const status = resolved && resolved.status !== "unknown" ? resolved.status : ipo.status;
      candidates.push({
        ipoId: ipo.id,
        slug: ipo.slug,
        companyName: company?.name ?? ipo.slug,
        status,
        openDate: ipo.dates.openDate,
        closeDate: ipo.dates.closeDate,
        allotmentDate: ipo.dates.allotmentDate,
        listingDate: ipo.dates.listingDate,
        listingConfirmed: ipo.status === "listed",
        allotmentConfirmed: ipo.allotmentConfirmed === true || prior?.allotmentConfirmed === true,
        registrarId: identified.registrarId,
        registrarName: registrar?.name ?? null,
        allotmentUrl: identified.portalUrl,
        registrarCompanyId: prior?.matchedCompanyId ?? null,
      });
    }

    const publishedByRegistrar = new Map<
      string,
      { sourceUrl: string; names: readonly string[]; companies: readonly PublishedCompany[] }
    >();
    for (const issue of candidates) {
      if (input.stopped?.()) break;
      const prior = await input.verifications.findByIpo(issue.ipoId);
      const plan = planAllotmentCheck({
        now,
        allotmentDate: issue.allotmentDate,
        closeDate: issue.closeDate,
        allotmentConfirmed: issue.allotmentConfirmed || prior?.allotmentConfirmed === true,
        status: issue.status,
        lastCheckedAt: prior?.lastCheckedAt ?? null,
        nextCheckAt: prior?.nextCheckAt ?? null,
        policy,
      });
      if (!plan.due) {
        result.skipped += 1;
        continue;
      }
      const verifierId = resolveVerifierId({ registrarId: issue.registrarId, registrarName: issue.registrarName });
      const verifier = verifierId ? verifiers[verifierId] : null;
      if (!verifier) {
        const unsupported = unsupportedAllotmentVerification({ ipoId: issue.ipoId, now, nextCheckAt: null });
        await input.verifications.upsert(
          toStored({
            ...unsupported,
            registrarId: issue.registrarId,
            verificationMethod: null,
            sourceUrl: issue.allotmentUrl,
            matchedCompanyId: null,
            monitoringStartedAt: plan.monitoringStartedAt,
            notificationDispatch: "not-sent",
            notificationEligibleDevices: null,
            notificationAccepted: null,
            notificationRejected: null,
            errorName: null,
          }),
        );
        result.unsupported += 1;
        result.checked += 1;
        continue;
      }
      try {
        if (verifier.listPublishedIssues && !publishedByRegistrar.has(verifier.registrarId)) {
          const listed = await verifier.listPublishedIssues(now);
          publishedByRegistrar.set(verifier.registrarId, {
            sourceUrl: listed.sourceUrl,
            names: listed.names,
            companies: listed.companies ?? listed.names.map((name) => ({ id: "", name })),
          });
        }
        const shared = publishedByRegistrar.get(verifier.registrarId);
        const adapterResult = await verifier.verify({
          issue,
          now,
          publishedNames: shared?.names,
          publishedCompanies: shared?.companies,
          sourceUrl: shared?.sourceUrl ?? issue.allotmentUrl,
        });
        let record = fromAdapter({
          ipoId: issue.ipoId,
          result: adapterResult,
          nextCheckAt: plan.nextCheckAt,
          monitoringStartedAt: plan.monitoringStartedAt,
        });
        if (record.allotmentConfirmed) {
          record = await applyAllotmentConfirmation({
            store: input.store,
            verifications: input.verifications,
            cache: input.cache,
            issue,
            record,
            notifier: input.notifier,
            now,
          });
          result.confirmed += 1;
        } else {
          // Preserve a previously confirmed record if an adapter briefly fails later.
          if (prior?.allotmentConfirmed) {
            result.skipped += 1;
            continue;
          }
          await input.verifications.upsert(toStored(record));
          if (record.verificationStatus === "unsupported") result.unsupported += 1;
          if (record.verificationStatus === "failed") result.errors += 1;
        }
        result.checked += 1;
      } catch (error) {
        result.errors += 1;
        result.checked += 1;
        if (prior?.allotmentConfirmed) continue;
        await input.verifications.upsert(
          toStored({
            ipoId: issue.ipoId,
            registrarId: issue.registrarId,
            verificationStatus: "failed",
            allotmentConfirmed: false,
            verificationSource: null,
            verificationEvidence: null,
            verificationMethod: null,
            sourceUrl: issue.allotmentUrl,
            matchedCompanyId: prior?.matchedCompanyId ?? null,
            verifiedAt: null,
            monitoringStartedAt: plan.monitoringStartedAt,
            lastCheckedAt: now.toISOString(),
            nextCheckAt: plan.nextCheckAt,
            note: error instanceof Error ? error.message : "Allotment verification failed.",
            notificationDispatch: "not-sent",
            notificationEligibleDevices: null,
            notificationAccepted: null,
            notificationRejected: null,
            errorName: error instanceof Error ? error.name : "Error",
          }),
        );
        input.logger.error("Allotment verification failed", {
          ipoId: issue.ipoId,
          name: error instanceof Error ? error.name : "Error",
        });
      }
    }
    return result;
  } finally {
    await release();
  }
}

export async function adminConfirmStoredAllotment(input: {
  store: PersistenceStore;
  verifications: AllotmentVerificationStore;
  cache?: Pick<CacheService, "invalidateAfterSync"> | null;
  issue: AllotmentVerifyIssue;
  auditor: string;
  evidenceNote: string;
  sourceUrl: string;
  notifier?: AllotmentConfirmNotifier | null;
  now: Date;
}): Promise<AllotmentVerificationRecord | { error: string }> {
  const shaped = adminConfirmShape({
    ipoId: input.issue.ipoId,
    now: input.now,
    auditor: input.auditor,
    evidenceNote: input.evidenceNote,
  });
  if ("error" in shaped) return shaped;
  const url = verifiedAllotmentUrl({
    name: input.issue.registrarName,
    statusPage: input.sourceUrl,
  });
  if (!url) return { error: "A verified official registrar source URL is required." };
  const record: AllotmentVerificationRecord = {
    ...shaped,
    registrarId: input.issue.registrarId,
    verificationMethod: "admin-audit",
    sourceUrl: url,
    matchedCompanyId: null,
    monitoringStartedAt: null,
    notificationDispatch: "not-sent",
    notificationEligibleDevices: null,
    notificationAccepted: null,
    notificationRejected: null,
    errorName: null,
  };
  return applyAllotmentConfirmation({
    store: input.store,
    verifications: input.verifications,
    cache: input.cache,
    issue: input.issue,
    record,
    notifier: input.notifier,
    now: input.now,
  });
}
