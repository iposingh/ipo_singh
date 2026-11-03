import {
  adminAllotmentActionResultSchema,
  adminAllotmentConfirmRequestSchema,
  adminAllotmentRetryRequestSchema,
  adminAllotmentVerificationListSchema,
  type AdminAllotmentVerificationRow,
} from "@ipo-singh/contracts";
import type { NextFunction, Request, Response, Router } from "express";
import type { CacheHandle } from "../cache/connection.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import {
  adminConfirmStoredAllotment,
  createMongoAllotmentVerificationStore,
  identifyRegistrar,
  runAllotmentVerificationPass,
} from "../jobs/allotment-verify.ts";
import { createAllotmentConfirmNotifier } from "../jobs/allotment/notify.ts";
import { createSyncLock } from "../jobs/lock.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import type { AdminAuditStore } from "./audit.ts";
import type { PasswordHasher } from "./passwords.ts";
import type { AccountStore } from "./records.ts";
import { createAccountId } from "./tokens.ts";

export type AdminAllotmentDeps = {
  readStore: () => AccountStore | undefined;
  readAudit: () => AdminAuditStore | undefined;
  readDatabase: () => DatabaseHandle;
  cache: CacheHandle;
  hasher: PasswordHasher;
  logger: Logger;
  protect: (allowed: readonly ("admin" | "super-admin")[]) => (req: Request, res: Response, next: NextFunction) => void;
  confirmPassword: (store: AccountStore, hasher: PasswordHasher, userId: string, password: string) => Promise<boolean>;
  actorId: (req: Request) => string;
  record: (event: {
    actorUserId: string;
    action: "allotment_confirm" | "allotment_retry";
    outcome: "succeeded" | "denied";
    targetUserId: string | null;
  }) => Promise<void>;
};

function storeOrThrow(readStore: () => AccountStore | undefined): AccountStore {
  const store = readStore();
  if (!store) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
  return store;
}

async function buildRows(database: DatabaseHandle): Promise<AdminAllotmentVerificationRow[]> {
  const persistence = database.store;
  if (!persistence) return [];
  const verifications = createMongoAllotmentVerificationStore();
  const [ipos, listed] = await Promise.all([persistence.ipos.list(), verifications.list(300)]);
  const byIpo = new Map(listed.map((row) => [row.ipoId, row]));
  const rows: AdminAllotmentVerificationRow[] = [];
  for (const ipo of ipos) {
    if (ipo.status !== "closed" && ipo.status !== "allotment" && ipo.allotmentConfirmed !== true) continue;
    const company = await persistence.companies.findById(ipo.companyId);
    const registrar = ipo.registrarId ? await persistence.registrars.findById(ipo.registrarId) : null;
    const identified = identifyRegistrar({
      registrarId: ipo.registrarId,
      registrarName: registrar?.name ?? null,
      allotmentUrl: registrar?.allotmentUrl ?? null,
    });
    const prior = byIpo.get(ipo.id);
    rows.push({
      ipoId: ipo.id,
      slug: ipo.slug,
      companyName: company?.name ?? null,
      registrarId: identified.registrarId,
      registrarName: registrar?.name ?? null,
      expectedAllotmentDate: ipo.dates.allotmentDate,
      monitoringStartedAt: prior?.monitoringStartedAt ?? null,
      verificationStatus: prior?.verificationStatus ?? (ipo.allotmentConfirmed ? "confirmed" : "pending"),
      allotmentConfirmed: ipo.allotmentConfirmed === true || prior?.allotmentConfirmed === true,
      lastCheckedAt: prior?.lastCheckedAt ?? null,
      nextCheckAt: prior?.nextCheckAt ?? null,
      evidenceSource: prior?.verificationSource ?? null,
      verificationEvidence: prior?.verificationEvidence ?? null,
      matchedCompanyId: prior?.matchedCompanyId ?? null,
      sourceUrl: prior?.sourceUrl ?? identified.portalUrl,
      verifiedAt: prior?.verifiedAt ?? null,
      notificationDispatch: prior?.notificationDispatch ?? "not-sent",
      notificationEligibleDevices: prior?.notificationEligibleDevices ?? null,
      notificationAccepted: prior?.notificationAccepted ?? null,
      notificationRejected: prior?.notificationRejected ?? null,
      errorName: prior?.errorName ?? null,
      note: prior?.note ?? null,
    });
  }
  return rows.sort((left, right) => {
    if (left.allotmentConfirmed !== right.allotmentConfirmed) return left.allotmentConfirmed ? 1 : -1;
    return (right.lastCheckedAt ?? "").localeCompare(left.lastCheckedAt ?? "");
  });
}

export function mountAdminAllotmentRoutes(router: Router, deps: AdminAllotmentDeps): void {
  const administrators = ["admin", "super-admin"] as const;

  router.get("/allotment-verifications", deps.protect(administrators), (req, res, next) => {
    void listVerifications(req, res, next, deps);
  });

  router.post("/allotment-verifications/confirm", deps.protect(administrators), (req, res, next) => {
    void confirmVerification(req, res, next, deps);
  });

  router.post("/allotment-verifications/retry", deps.protect(administrators), (req, res, next) => {
    void retryVerification(req, res, next, deps);
  });
}

async function listVerifications(_req: Request, res: Response, next: NextFunction, deps: AdminAllotmentDeps): Promise<void> {
  try {
    const items = await buildRows(deps.readDatabase());
    res.json(adminAllotmentVerificationListSchema.parse({ items }));
  } catch (error) {
    next(error);
  }
}

async function confirmVerification(req: Request, res: Response, next: NextFunction, deps: AdminAllotmentDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const actor = deps.actorId(req);
    const parsed = adminAllotmentConfirmRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    if (!(await deps.confirmPassword(store, deps.hasher, actor, parsed.data.currentPassword))) {
      await deps.record({ actorUserId: actor, action: "allotment_confirm", outcome: "denied", targetUserId: null });
      throw new HttpError(403, "forbidden", "Check the current password and try again.");
    }
    const database = deps.readDatabase();
    const persistence = database.store;
    if (!persistence) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
    const ipo = await persistence.ipos.findById(parsed.data.ipoId);
    if (!ipo) throw new HttpError(404, "not_found", "That IPO was not found.");
    const company = await persistence.companies.findById(ipo.companyId);
    const registrar = ipo.registrarId ? await persistence.registrars.findById(ipo.registrarId) : null;
    const identified = identifyRegistrar({
      registrarId: ipo.registrarId,
      registrarName: registrar?.name ?? null,
      allotmentUrl: registrar?.allotmentUrl ?? null,
    });
    const result = await adminConfirmStoredAllotment({
      store: persistence,
      verifications: createMongoAllotmentVerificationStore(),
      cache: deps.cache.service,
      issue: {
        ipoId: ipo.id,
        slug: ipo.slug,
        companyName: company?.name ?? ipo.slug,
        status: ipo.status,
        openDate: ipo.dates.openDate,
        closeDate: ipo.dates.closeDate,
        allotmentDate: ipo.dates.allotmentDate,
        listingDate: ipo.dates.listingDate,
        listingConfirmed: ipo.status === "listed",
        allotmentConfirmed: ipo.allotmentConfirmed === true,
        registrarId: identified.registrarId,
        registrarName: registrar?.name ?? null,
        allotmentUrl: identified.portalUrl,
      },
      auditor: actor,
      evidenceNote: parsed.data.evidenceNote,
      sourceUrl: parsed.data.sourceUrl,
      notifier: createAllotmentConfirmNotifier({ database }),
      now: new Date(),
    });
    if ("error" in result) throw new HttpError(400, "validation_error", result.error);
    await deps.record({ actorUserId: actor, action: "allotment_confirm", outcome: "succeeded", targetUserId: null });
    const [row] = (await buildRows(database)).filter((item) => item.ipoId === ipo.id);
    res.json(
      adminAllotmentActionResultSchema.parse({
        ok: true as const,
        row:
          row ??
          ({
            ipoId: ipo.id,
            slug: ipo.slug,
            companyName: company?.name ?? null,
            registrarId: identified.registrarId,
            registrarName: registrar?.name ?? null,
            expectedAllotmentDate: ipo.dates.allotmentDate,
            monitoringStartedAt: result.monitoringStartedAt,
            verificationStatus: result.verificationStatus,
            allotmentConfirmed: result.allotmentConfirmed,
            lastCheckedAt: result.lastCheckedAt,
            nextCheckAt: result.nextCheckAt,
            evidenceSource: result.verificationSource,
            verificationEvidence: result.verificationEvidence,
            matchedCompanyId: result.matchedCompanyId,
            sourceUrl: result.sourceUrl,
            verifiedAt: result.verifiedAt,
            notificationDispatch: result.notificationDispatch,
            notificationEligibleDevices: result.notificationEligibleDevices,
            notificationAccepted: result.notificationAccepted,
            notificationRejected: result.notificationRejected,
            errorName: result.errorName,
            note: result.note,
          } satisfies AdminAllotmentVerificationRow),
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function retryVerification(req: Request, res: Response, next: NextFunction, deps: AdminAllotmentDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const actor = deps.actorId(req);
    const parsed = adminAllotmentRetryRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    if (!(await deps.confirmPassword(store, deps.hasher, actor, parsed.data.currentPassword))) {
      await deps.record({ actorUserId: actor, action: "allotment_retry", outcome: "denied", targetUserId: null });
      throw new HttpError(403, "forbidden", "Check the current password and try again.");
    }
    const database = deps.readDatabase();
    const persistence = database.store;
    if (!persistence) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
    const ipo = await persistence.ipos.findById(parsed.data.ipoId);
    if (!ipo) throw new HttpError(404, "not_found", "That IPO was not found.");
    const verifications = createMongoAllotmentVerificationStore();
    const prior = await verifications.findByIpo(ipo.id);
    if (prior) {
      await verifications.upsert({ ...prior, nextCheckAt: new Date().toISOString() });
    }
    await runAllotmentVerificationPass({
      store: persistence,
      verifications,
      // Without Redis, acquire fails closed — do not grant a process-local lock on a multi-host API.
      locks: createSyncLock(deps.cache.store, { environment: deps.cache.policy.environment }),
      cache: deps.cache.service,
      logger: deps.logger,
      now: () => new Date(),
      notifier: createAllotmentConfirmNotifier({ database }),
    });
    await deps.record({ actorUserId: actor, action: "allotment_retry", outcome: "succeeded", targetUserId: null });
    const rows = await buildRows(database);
    const row = rows.find((item) => item.ipoId === ipo.id);
    if (!row) throw new HttpError(404, "not_found", "That IPO was not found in the verification list.");
    res.json(adminAllotmentActionResultSchema.parse({ ok: true as const, row }));
  } catch (error) {
    next(error);
  }
}

/** Test helper keeps the unused import of createAccountId discoverable for future audit ids. */
export function allotmentAdminRequestId(): string {
  return createAccountId();
}
