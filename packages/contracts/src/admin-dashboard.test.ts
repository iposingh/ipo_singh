import assert from "node:assert/strict";
import test from "node:test";
import { adminIpoInspectionSchema, adminManualSyncRequestSchema } from "./admin-dashboard.ts";

test("dashboard inspection and manual sync reject extra fields", () => {
  assert.equal(adminManualSyncRequestSchema.safeParse({ currentPassword: "secret", category: "history" }).success, false);
  assert.equal(adminManualSyncRequestSchema.safeParse({ currentPassword: "secret", apiKey: "key" }).success, false);
  const row = {
    slug: "northwind-metals",
    companyName: "Northwind Metals",
    board: "mainboard",
    status: "open",
    freshness: "fresh",
    fetchedAt: "2026-10-25T00:00:00.000Z",
  };
  assert.equal(adminIpoInspectionSchema.safeParse({ complete: true, records: [row] }).success, true);
  assert.equal(adminIpoInspectionSchema.safeParse({ complete: true, records: [{ ...row, gmpRupees: 12 }] }).success, false);
  assert.equal(adminIpoInspectionSchema.safeParse({ complete: true, records: [{ ...row, priceBandLowRupees: 100 }] }).success, false);
});
