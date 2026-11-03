import assert from "node:assert/strict";
import test from "node:test";
import { adminProviderStatusSchema, adminRoleChangeRequestSchema } from "./admin.ts";

const userId = "018f6b2e-7c1a-7b2d-8e3f-4a5b6c7d8e9f";

test("admin responses and role changes reject credential fields", () => {
  assert.equal(
    adminProviderStatusSchema.safeParse({
      provider: "ipo-guru",
      ipoGuruEnabled: true,
      credentialConfigured: true,
      minuteBudget: 40,
      dailyBudget: 3000,
      account: null,
      apiKey: "secret",
    }).success,
    false,
  );
  assert.equal(
    adminRoleChangeRequestSchema.safeParse({
      userId,
      role: "admin",
      currentPassword: "Horse-battery-99",
      passwordHash: "hidden",
    }).success,
    false,
  );
  assert.equal(
    adminProviderStatusSchema.parse({
      provider: "not_configured",
      ipoGuruEnabled: false,
      credentialConfigured: false,
      minuteBudget: null,
      dailyBudget: null,
      account: null,
    }).credentialConfigured,
    false,
  );
});
