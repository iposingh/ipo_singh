import assert from "node:assert/strict";
import test from "node:test";
import { defaultCachePolicy } from "../../config/cache-policy.ts";
import { createMemoryStore } from "../../cache/memory-store.ts";
import { createCacheService } from "../../cache/service.ts";
import type { PersistenceStore } from "../../db/repositories.ts";
import type { CompanyRecord, IpoRecord, RegistrarRecord } from "../../db/records.ts";
import { createLogger } from "../../shared/logger.ts";
import { createSyncLock } from "../lock.ts";
import { createMemoryAllotmentVerificationStore } from "./memory-store.ts";
import { applyAllotmentConfirmation, identifyRegistrar, runAllotmentVerificationPass } from "./service.ts";
import type { AllotmentVerifier } from "./types.ts";

const source = () => ({
  source: "test",
  fetchedAt: new Date("2026-10-08T00:00:00.000Z"),
  sourceUpdatedAt: null,
  freshness: "fresh" as const,
});

function company(): CompanyRecord {
  return { id: "fixture-co", name: "Fixture Polymers Limited", symbol: null, source: source() };
}

function registrar(): RegistrarRecord {
  return {
    id: "fixture-registrar",
    name: "Bigshare Services",
    websiteUrl: null,
    allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    source: source(),
  };
}

function ipo(partial?: Partial<IpoRecord>): IpoRecord {
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
    allotmentConfirmed: false,
    source: source(),
    ...partial,
  };
}

function memoryPersistence(rows: IpoRecord[]): PersistenceStore {
  const ipos = new Map(rows.map((row) => [row.id, row]));
  const companies = new Map([["fixture-co", company()]]);
  const registrars = new Map([["fixture-registrar", registrar()]]);
  return {
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
      async findById(id: string) {
        return companies.get(id) ?? null;
      },
    },
    registrars: {
      async findById(id: string) {
        return registrars.get(id) ?? null;
      },
    },
  } as unknown as PersistenceStore;
}

test("identifyRegistrar maps Bigshare aliases to the verified portal", () => {
  const identified = identifyRegistrar({
    registrarId: null,
    registrarName: "Bigshare Services Private Limited",
    allotmentUrl: null,
  });
  assert.equal(identified.registrarId, "bigshare");
  assert.equal(identified.portalUrl, "https://ipo.bigshareonline.com/ipo_status.html");
});

test("verification pass confirms after 9 PM IST and invalidates cache", async () => {
  const store = memoryPersistence([ipo()]);
  const verifications = createMemoryAllotmentVerificationStore();
  const logger = createLogger({ level: "error", service: "test" });
  const cache = createCacheService({ store: createMemoryStore(), policy: defaultCachePolicy(), logger });
  let invalidated = 0;
  const wrapped = {
    invalidateAfterSync: async (...args: Parameters<typeof cache.invalidateAfterSync>) => {
      invalidated += 1;
      return cache.invalidateAfterSync(...args);
    },
  };
  const verifier: AllotmentVerifier = {
    registrarId: "bigshare",
    async listPublishedIssues() {
      return {
        sourceUrl: "https://ipo.bigshareonline.com/ipo_status.html",
        names: ["Fixture Polymers Limited", "Other Co"],
        companies: [
          { id: "1", name: "Fixture Polymers Limited" },
          { id: "2", name: "Other Co" },
        ],
        note: "fixture",
      };
    },
    async verify(input) {
      return {
        outcome: "confirmed",
        registrarId: "bigshare",
        sourceUrl: input.sourceUrl ?? "https://ipo.bigshareonline.com/ipo_status.html",
        observedAt: input.now.toISOString(),
        matchedName: "Fixture Polymers Limited",
        matchedCompanyId: "1",
        evidence: "Unique registrar company list entry: Fixture Polymers Limited (1)",
        method: "bigshare-html-company-select",
        note: "fixture",
      };
    },
  };
  const summary = await runAllotmentVerificationPass({
    store,
    verifications,
    locks: createSyncLock(null, { allowProcessLocal: true }),
    cache: wrapped,
    logger,
    now: () => new Date("2026-10-08T15:30:00.000Z"),
    verifiers: { bigshare: verifier },
    notifier: async () => ({ dispatch: "queued", eligibleDevices: 3, queuedUsers: 2 }),
  });
  assert.equal(summary.confirmed, 1);
  const saved = await store.ipos.findById("fixture-ipo");
  assert.equal(saved?.allotmentConfirmed, true);
  assert.equal(saved?.status, "allotment");
  assert.ok(saved?.allotmentConfirmedAt);
  assert.ok(invalidated >= 1);
  const record = await verifications.findByIpo("fixture-ipo");
  assert.equal(record?.matchedCompanyId, "1");
  assert.equal(record?.notificationDispatch, "queued");
  assert.equal(record?.notificationEligibleDevices, 3);
});

test("confirmation does not move listed IPOs backwards", async () => {
  const listed = memoryPersistence([ipo({ id: "listed-ipo", slug: "listed-co", status: "listed" })]);
  const verifications = createMemoryAllotmentVerificationStore();
  const blocked = await applyAllotmentConfirmation({
    store: listed,
    verifications,
    issue: {
      ipoId: "listed-ipo",
      slug: "listed-co",
      companyName: "Fixture Polymers Limited",
      status: "listed",
      openDate: "2026-09-01",
      closeDate: "2026-09-03",
      allotmentDate: "2026-09-08",
      listingDate: "2026-09-10",
      listingConfirmed: true,
      allotmentConfirmed: false,
      registrarId: "bigshare",
      registrarName: "Bigshare Services",
      allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    },
    record: {
      ipoId: "listed-ipo",
      registrarId: "bigshare",
      verificationStatus: "confirmed",
      allotmentConfirmed: true,
      verificationSource: "admin-audit",
      verificationEvidence: "manual",
      verificationMethod: "admin-audit",
      sourceUrl: "https://ipo.bigshareonline.com/ipo_status.html",
      matchedCompanyId: null,
      verifiedAt: "2026-09-08T05:00:00.000Z",
      monitoringStartedAt: null,
      lastCheckedAt: "2026-09-08T05:00:00.000Z",
      nextCheckAt: null,
      note: "admin",
      notificationDispatch: "not-sent",
      notificationEligibleDevices: null,
      notificationAccepted: null,
      notificationRejected: null,
      errorName: null,
    },
    now: new Date("2026-09-08T05:00:00.000Z"),
  });
  assert.equal(blocked.allotmentConfirmed, false);
  assert.match(blocked.note, /Listed/);
});

test("lock skips a concurrent verification pass", async () => {
  const locks = createSyncLock(null, { allowProcessLocal: true });
  const first = await locks.acquire("allotment-verify-pass", 60_000);
  assert.ok(first);
  const summary = await runAllotmentVerificationPass({
    store: memoryPersistence([]),
    verifications: createMemoryAllotmentVerificationStore(),
    locks,
    logger: createLogger({ level: "error", service: "test" }),
    now: () => new Date("2026-10-08T15:30:00.000Z"),
  });
  assert.equal(summary.skipped, 1);
  assert.equal(summary.checked, 0);
  await first();
});
