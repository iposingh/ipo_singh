import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccountPreferences } from "@ipo-singh/contracts";
import { defaultCachePolicy } from "../../config/cache-policy.ts";
import { createMemoryStore } from "../../cache/memory-store.ts";
import { createCacheService } from "../../cache/service.ts";
import type { PersistenceStore } from "../../db/repositories.ts";
import type { CompanyRecord, IpoRecord, RegistrarRecord } from "../../db/records.ts";
import { createMemoryNotificationStore } from "../../notifications/memory-store.ts";
import { createMemoryPushTokenStore } from "../../notifications/push-memory-store.ts";
import { createLogger } from "../../shared/logger.ts";
import { createSyncLock } from "../lock.ts";
import type { AllotmentVerifier } from "./types.ts";
import { createMemoryAllotmentVerificationStore } from "./memory-store.ts";
import { createAllotmentConfirmNotifier } from "./notify.ts";
import { runAllotmentVerificationPass } from "./service.ts";

const source = () => ({
  source: "test",
  fetchedAt: new Date("2026-10-08T00:00:00.000Z"),
  sourceUpdatedAt: null,
  freshness: "fresh" as const,
});

function fixtureIpo(confirmed = false): IpoRecord {
  return {
    id: "fixture-ipo",
    slug: "fixture-polymers",
    companyId: "fixture-co",
    board: "mainboard",
    status: "closed",
    issue: {
      priceBandLowRupees: null,
      priceBandHighRupees: null,
      issuePriceRupees: null,
      issueSizeRupees: null,
      lotSizeShares: null,
      minimumInvestmentRupees: null,
    },
    dates: {
      openDate: "2026-10-01",
      closeDate: "2026-10-03",
      allotmentDate: "2026-10-08",
      listingDate: null,
    },
    listing: null,
    registrarId: "fixture-registrar",
    providerMappings: [],
    allotmentConfirmed: confirmed,
    source: source(),
  };
}

test("end-to-end: 9 PM IST absent then present confirms allotment, queues global push, and dedupes", async () => {
  let published = false;
  const ipo = fixtureIpo(false);
  const ipos = new Map([[ipo.id, ipo]]);
  const store = {
    ipos: {
      async list() {
        return [...ipos.values()];
      },
      async findById(id: string) {
        return ipos.get(id) ?? null;
      },
      async upsert(record: IpoRecord) {
        ipos.set(record.id, record);
        return record;
      },
    },
    companies: {
      async findById(): Promise<CompanyRecord | null> {
        return { id: "fixture-co", name: "Fixture Polymers Limited", symbol: null, source: source() };
      },
    },
    registrars: {
      async findById(): Promise<RegistrarRecord | null> {
        return {
          id: "fixture-registrar",
          name: "Bigshare Services",
          websiteUrl: null,
          allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
          source: source(),
        };
      },
    },
  } as unknown as PersistenceStore;

  const verifier: AllotmentVerifier = {
    registrarId: "bigshare",
    async listPublishedIssues() {
      const names = published ? ["Fixture Polymers Limited"] : ["Other Co Limited"];
      return {
        sourceUrl: "https://ipo.bigshareonline.com/ipo_status.html",
        names,
        companies: names.map((name, index) => ({ id: String(index + 1), name })),
        note: "fixture",
      };
    },
    async verify(input) {
      const listed = await this.listPublishedIssues?.(input.now);
      const hit = listed?.companies?.find((row) => row.name === input.issue.companyName) ?? null;
      if (!hit) {
        return {
          outcome: "not_confirmed",
          registrarId: "bigshare",
          sourceUrl: listed?.sourceUrl ?? "",
          observedAt: input.now.toISOString(),
          matchedName: null,
          matchedCompanyId: null,
          evidence: null,
          method: "bigshare-html-company-select",
          note: "absent",
        };
      }
      return {
        outcome: "confirmed",
        registrarId: "bigshare",
        sourceUrl: listed?.sourceUrl ?? "",
        observedAt: input.now.toISOString(),
        matchedName: hit.name,
        matchedCompanyId: hit.id,
        evidence: `Unique registrar company list entry: ${hit.name}`,
        method: "bigshare-html-company-select",
        note: "present",
      };
    },
  };

  const verifications = createMemoryAllotmentVerificationStore();
  const notifications = createMemoryNotificationStore();
  const pushTokens = createMemoryPushTokenStore();
  const now = new Date("2026-10-01T00:00:00.000Z");
  for (const [userId, tokenId] of [
    ["watchlisted", "tw"],
    ["broadcast", "tb"],
  ] as const) {
    await pushTokens.insert({
      id: tokenId,
      userId,
      deviceId: `d-${tokenId}`,
      platform: "ios",
      token: `ExponentPushToken[${tokenId}]`,
      status: "active",
      ownerKind: "user",
      allotmentAlertsEnabled: true,
      mainboardGlobalAlerts: false,
      smeWatchlistAlerts: false,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
      invalidAt: null,
    });
  }
  const users = new Map(
    ["watchlisted", "broadcast"].map((id) => [
      id,
      {
        id,
        email: `${id}@example.com`,
        displayName: id,
        status: "active" as const,
        role: "member" as const,
        preferences: {
          ...defaultAccountPreferences,
          alertsEnabled: true,
          mainboardGlobalAlerts: true,
          smeWatchlistAlerts: false,
          mobilePush: "when-available" as const,
          notificationCategories: { ...defaultAccountPreferences.notificationCategories, allotment: true },
        },
        createdAt: now,
        updatedAt: now,
        statusChangedAt: now,
        lastAuthenticatedAt: null,
        suspendedAt: null,
        closedAt: null,
        passwordHash: null,
      },
    ]),
  );
  const database = {
    store,
    accounts: {
      async findUser(id: string) {
        return users.get(id) ?? null;
      },
    },
    pushTokens,
    notifications,
  };

  const notifier = createAllotmentConfirmNotifier({
    database: database as never,
    notifications,
    broadcastEnabled: true,
  });
  const logger = createLogger({ level: "error", service: "test" });
  const cache = createCacheService({ store: createMemoryStore(), policy: defaultCachePolicy(), logger });

  // Before 9 PM IST: no monitoring.
  const early = await runAllotmentVerificationPass({
    store,
    verifications,
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cache,
    logger,
    now: () => new Date("2026-10-08T15:00:00.000Z"),
    verifiers: { bigshare: verifier },
    notifier,
  });
  assert.equal(early.checked, 0);
  assert.equal((await store.ipos.findById("fixture-ipo"))?.allotmentConfirmed, false);

  // 9 PM IST, IPO absent: remains awaited.
  const absent = await runAllotmentVerificationPass({
    store,
    verifications,
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cache,
    logger,
    now: () => new Date("2026-10-08T15:30:00.000Z"),
    verifiers: { bigshare: verifier },
    notifier,
  });
  assert.equal(absent.checked, 1);
  assert.equal(absent.confirmed, 0);
  assert.equal((await verifications.findByIpo("fixture-ipo"))?.verificationStatus, "unconfirmed");
  assert.equal((await store.ipos.findById("fixture-ipo"))?.allotmentConfirmed, false);

  // Next cycle, IPO present: confirmed + broadcast queued.
  published = true;
  const present = await runAllotmentVerificationPass({
    store,
    verifications,
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cache,
    logger,
    now: () => new Date("2026-10-08T15:45:00.000Z"),
    verifiers: { bigshare: verifier },
    notifier,
  });
  assert.equal(present.confirmed, 1);
  const saved = await store.ipos.findById("fixture-ipo");
  assert.equal(saved?.allotmentConfirmed, true);
  assert.equal(saved?.status, "allotment");
  assert.ok(saved?.allotmentConfirmedAt);
  const record = await verifications.findByIpo("fixture-ipo");
  assert.equal(record?.allotmentConfirmed, true);
  assert.equal(record?.matchedCompanyId, "1");
  assert.equal(record?.notificationDispatch, "queued");
  assert.equal(record?.notificationEligibleDevices, 2);
  assert.equal((await notifications.listForUser("watchlisted", new Date("2026-10-08T16:00:00.000Z"))).length, 1);
  assert.equal((await notifications.listForUser("broadcast", new Date("2026-10-08T16:00:00.000Z"))).length, 1);
  assert.equal(
    (await notifications.listForUser("broadcast", new Date("2026-10-08T16:00:00.000Z")))[0]?.dedupeKey,
    "ipo-allotment-confirmed:fixture-ipo",
  );

  // Duplicate worker pass does not reconfirm or requeue.
  const again = await runAllotmentVerificationPass({
    store,
    verifications,
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cache,
    logger,
    now: () => new Date("2026-10-08T16:00:00.000Z"),
    verifiers: { bigshare: verifier },
    notifier,
  });
  assert.equal(again.confirmed, 0);
  assert.equal((await notifications.listForUser("broadcast", new Date("2026-10-08T16:30:00.000Z"))).length, 1);

  // Concurrent lock: second pass skips.
  const locks = createSyncLock(null, { allowProcessLocal: true });
  const held = await locks.acquire("allotment-verify-pass", 60_000);
  assert.ok(held);
  const locked = await runAllotmentVerificationPass({
    store,
    verifications,
    locks,
    logger,
    now: () => new Date("2026-10-08T16:15:00.000Z"),
    verifiers: { bigshare: verifier },
    notifier,
  });
  assert.equal(locked.skipped, 1);
  await held();
});
