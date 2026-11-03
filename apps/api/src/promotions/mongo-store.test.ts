import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import { after, before, describe, it } from "node:test";
import { defaultCachePolicy } from "../config/cache-policy.ts";
import type { AppConfig } from "../config/env.ts";
import { defaultHttpLimits } from "../config/http-limits.ts";
import { disabledIpoGuruConfig } from "../config/ipoguru.ts";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { connectDatabase, type ConnectedDatabase } from "../db/connection.ts";
import { parseMongoTarget } from "../db/mongo-target.ts";
import { createLogger } from "../shared/logger.ts";
import type { BannerImageRecord, BannerRecord } from "./records.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const quiet = createLogger({ level: "error", service: "test", sink: () => undefined });

function mongoConfig(uri: string, database: string, host: string): AppConfig {
  return {
    nodeEnv: "test",
    deployment: "test",
    host: "127.0.0.1",
    port: 0,
    corsOrigins: [],
    logLevel: "error",
    requestBodyLimit: "100kb",
    shutdownTimeoutMs: 1000,
    ...defaultHttpLimits(),
    trustProxy: false,
    serviceName: "ipo-singh-api",
    version: "0.1.0",
    mongodb: {
      uri,
      host,
      database,
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMs: 5000,
      connectTimeoutMs: 5000,
      socketTimeoutMs: 5000,
      retention: { gmpDays: 400, subscriptionDays: 400, syncHistoryDays: 90, providerUsageDays: 90 },
    },
    redis: null,
    cache: defaultCachePolicy(),
    quota: defaultQuotaPolicy(),
    provider: null,
    ipoGuru: disabledIpoGuruConfig(),
    internalServiceToken: null,
    opsToken: null,
  };
}

describe("promotion image storage", () => {
  let memory: MongoMemoryServer;
  let connected: ConnectedDatabase;

  before(async () => {
    memory = await MongoMemoryServer.create({ instance: { dbName: "ipo-singh-test" } });
    const base = memory.getUri().replace(/\/$/, "");
    const uri = base.endsWith("ipo-singh-test") ? base : `${base}/ipo-singh-test`;
    const target = parseMongoTarget(uri);
    assert.ok(target);
    assert.equal(target.database, "ipo-singh-test");
    assert.notEqual(uri, process.env.MONGODB_URI);
    connected = await connectDatabase(mongoConfig(uri, target.database, target.host), quiet);
  });

  after(async () => {
    await connected?.close();
    await memory?.stop();
  });

  it("stores banner image bytes and returns the same file", async () => {
    const store = connected.promotions;
    assert.ok(store);
    const now = new Date("2026-10-25T12:00:00.000Z");
    const banner: BannerRecord = {
      id: "banner-0123456789abcdef",
      title: "Mainboard IPOs",
      description: "Browse stored Mainboard issues on IPO Singh.",
      desktopImageId: "image-0123456789abcdef",
      mobileImageId: null,
      destinationUrl: "/ipos/mainboard",
      placement: "home",
      priority: 1,
      status: "draft",
      startAt: null,
      endAt: null,
      sponsored: false,
      disclosure: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const image: BannerImageRecord = {
      id: "image-0123456789abcdef",
      bannerId: banner.id,
      slot: "desktop",
      contentType: "image/png",
      width: 1,
      height: 1,
      byteLength: png.length,
      data: png,
      createdAt: now,
    };
    await store.insert(banner);
    await store.saveImage(image);
    const found = await store.findImage(image.id);
    assert.equal(found?.contentType, "image/png");
    assert.ok(found?.data.equals(png));
    const listed = await store.list();
    assert.equal(listed[0]?.desktopImageId, image.id);
    await store.deleteImagesForBanner(banner.id);
    await store.remove(banner.id);
    assert.equal(await store.findImage(image.id), null);
    assert.equal(await store.find(banner.id), null);
  });
});
