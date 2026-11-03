/**
 * Isolated allotment staging verification against a local/dev Mongo database.
 *
 * Usage (from apps/api, production polling/broadcasts stay off):
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/ipo-singh-allotment-verify-test \
 *   REDIS_URL= \
 *   ALLOTMENT_BROADCAST_ENABLED=false \
 *   node --experimental-strip-types src/jobs/allotment/staging-verify.ts
 *
 * Seeds a fixture IPO, runs mocked registrar lifecycle transitions, then deletes the fixture.
 * Does not send Expo pushes and does not touch production databases (name must contain test|dev|staging).
 * Uses process-local locks only (SYNC single-process). Prefer REDIS_URL when coordinating multiple processes.
 */
import mongoose from "mongoose";
import { loadLocalEnv } from "../../config/load-env.ts";
import { assertSafeDatabase, parseMongoTarget } from "../../db/mongo-target.ts";
import { ensureIndexes } from "../../db/models/index.ts";
import { createMongoStore } from "../../db/mongo-store.ts";
import { createMemoryStore } from "../../cache/memory-store.ts";
import { createCacheService } from "../../cache/service.ts";
import { defaultCachePolicy } from "../../config/cache-policy.ts";
import { createLogger } from "../../shared/logger.ts";
import { createSyncLock } from "../lock.ts";
import { createMongoAllotmentVerificationStore } from "./mongo-store.ts";
import { runAllotmentVerificationPass } from "./service.ts";
import type { AllotmentVerifier } from "./types.ts";
import type { CompanyRecord, IpoRecord, RegistrarRecord } from "../../db/records.ts";

const fixtureIpoId = "staging-allotment-fixture-ipo";
const fixtureCompanyId = "staging-allotment-fixture-co";
const fixtureRegistrarId = "staging-allotment-fixture-registrar";
const fixtureSlug = "staging-allotment-fixture";

function source() {
  return {
    source: "staging-verify",
    fetchedAt: new Date("2026-10-08T00:00:00.000Z"),
    sourceUpdatedAt: null,
    freshness: "fresh" as const,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }
  const target = parseMongoTarget(uri);
  if (!target?.database) {
    console.error("MONGODB_URI must include a database path");
    process.exit(1);
  }
  assertSafeDatabase("development", target.database); // lane: development/test DB names only

  if (process.env.ALLOTMENT_BROADCAST_ENABLED === "true") {
    console.error("Refuse to run staging verify with ALLOTMENT_BROADCAST_ENABLED=true");
    process.exit(1);
  }

  const logger = createLogger({ level: "info", service: "allotment-staging-verify" });
  await mongoose.connect(uri, { dbName: target.database, serverSelectionTimeoutMS: 5_000 });
  await ensureIndexes();
  logger.info("Connected", { host: target.host, database: target.database });

  const store = createMongoStore({
    gmpDays: 30,
    subscriptionDays: 30,
    syncHistoryDays: 30,
    providerUsageDays: 30,
  });
  const verifications = createMongoAllotmentVerificationStore();
  const cache = createCacheService({
    store: createMemoryStore(),
    policy: defaultCachePolicy(),
    logger,
  });

  let published = false;
  const verifier: AllotmentVerifier = {
    registrarId: "bigshare",
    async listPublishedIssues() {
      const names = published ? ["Staging Allotment Fixture Limited"] : ["Other Co Limited"];
      return {
        sourceUrl: "https://ipo.bigshareonline.com/ipo_status.html",
        names,
        companies: names.map((name, index) => ({ id: String(index + 1), name })),
        note: "staging-mock",
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

  const company: CompanyRecord = {
    id: fixtureCompanyId,
    name: "Staging Allotment Fixture Limited",
    symbol: null,
    source: source(),
  };
  const registrar: RegistrarRecord = {
    id: fixtureRegistrarId,
    name: "Bigshare Services",
    websiteUrl: null,
    allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    source: source(),
  };
  const ipo: IpoRecord = {
    id: fixtureIpoId,
    slug: fixtureSlug,
    companyId: fixtureCompanyId,
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
    registrarId: fixtureRegistrarId,
    providerMappings: [],
    allotmentConfirmed: false,
    source: source(),
  };

  try {
    await store.companies.upsert(company);
    await store.registrars.upsert(registrar);
    await store.ipos.upsert(ipo);
    await mongoose.connection.db?.collection("allotment_verifications").deleteOne({ _id: fixtureIpoId } as never);

    const early = await runAllotmentVerificationPass({
      store,
      verifications,
      locks: createSyncLock(null, { allowProcessLocal: true }),
      cache,
      logger,
      now: () => new Date("2026-10-08T15:00:00.000Z"),
      verifiers: { bigshare: verifier },
      notifier: async () => "skipped",
    });
    if (early.checked !== 0) throw new Error(`Expected no checks before 9 PM IST, got checked=${early.checked}`);

    const absent = await runAllotmentVerificationPass({
      store,
      verifications,
      locks: createSyncLock(null, { allowProcessLocal: true }),
      cache,
      logger,
      now: () => new Date("2026-10-08T15:30:00.000Z"),
      verifiers: { bigshare: verifier },
      notifier: async () => "skipped",
    });
    if (absent.confirmed !== 0) throw new Error("Absent company must not confirm");
    const awaited = await store.ipos.findById(fixtureIpoId);
    if (awaited?.allotmentConfirmed) throw new Error("IPO must remain unconfirmed while absent");

    published = true;
    const present = await runAllotmentVerificationPass({
      store,
      verifications,
      locks: createSyncLock(null, { allowProcessLocal: true }),
      cache,
      logger,
      now: () => new Date("2026-10-08T15:45:00.000Z"),
      verifiers: { bigshare: verifier },
      notifier: async () => ({ dispatch: "skipped", eligibleDevices: 0, queuedUsers: 0 }),
    });
    if (present.confirmed !== 1) throw new Error(`Expected confirmation, got confirmed=${present.confirmed}`);
    const confirmed = await store.ipos.findById(fixtureIpoId);
    const evidence = await verifications.findByIpo(fixtureIpoId);
    if (!confirmed?.allotmentConfirmed || confirmed.status !== "allotment") {
      throw new Error("IPO status was not updated to allotment confirmed");
    }
    if (!confirmed.allotmentConfirmedAt) throw new Error("Confirmation timestamp missing");
    if (evidence?.matchedCompanyId !== "1") throw new Error("Matched company id missing");
    if (evidence?.sourceUrl !== "https://ipo.bigshareonline.com/ipo_status.html") {
      throw new Error("Official registrar URL mismatch");
    }

    const again = await runAllotmentVerificationPass({
      store,
      verifications,
      locks: createSyncLock(null, { allowProcessLocal: true }),
      cache,
      logger,
      now: () => new Date("2026-10-08T16:00:00.000Z"),
      verifiers: { bigshare: verifier },
      notifier: async () => ({ dispatch: "queued", eligibleDevices: 99, queuedUsers: 99 }),
    });
    if (again.confirmed !== 0) throw new Error("Duplicate confirmation must not re-apply");
    const evidenceAgain = await verifications.findByIpo(fixtureIpoId);
    if (evidenceAgain?.notificationDispatch === "queued" && evidenceAgain.notificationEligibleDevices === 99) {
      throw new Error("Duplicate pass must not re-dispatch notifications");
    }

    logger.info("Staging allotment lifecycle verified", {
      ipoId: fixtureIpoId,
      allotmentConfirmed: true,
      matchedCompanyId: evidence?.matchedCompanyId,
      sourceUrl: evidence?.sourceUrl,
      verifiedAt: evidence?.verifiedAt,
    });
    console.log(JSON.stringify({ ok: true, ipoId: fixtureIpoId, matchedCompanyId: evidence?.matchedCompanyId }));
  } finally {
    await mongoose.connection.db?.collection("ipos").deleteOne({ _id: fixtureIpoId } as never);
    await mongoose.connection.db?.collection("companies").deleteOne({ _id: fixtureCompanyId } as never);
    await mongoose.connection.db?.collection("registrars").deleteOne({ _id: fixtureRegistrarId } as never);
    await mongoose.connection.db?.collection("allotment_verifications").deleteOne({ _id: fixtureIpoId } as never);
    await mongoose.disconnect();
  }
}

await main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
