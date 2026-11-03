import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveIpoGuruRequestLimits } from "./ipoguru.ts";

describe("effectiveIpoGuruRequestLimits", () => {
  it("caps application ceilings to configured IPO Guru budgets when enabled", () => {
    assert.deepEqual(
      effectiveIpoGuruRequestLimits({
        enabled: true,
        minuteBudget: 20,
        dailyBudget: 1_000,
        requestsPerMinute: 30,
        requestsPerDay: 1_000,
        reservedRequests: 50,
      }),
      { requestsPerMinute: 20, requestsPerDay: 1_000, reservedRequests: 50 },
    );
  });

  it("leaves application ceilings alone when IPO Guru is disabled", () => {
    assert.deepEqual(
      effectiveIpoGuruRequestLimits({
        enabled: false,
        minuteBudget: 20,
        dailyBudget: 250,
        requestsPerMinute: 30,
        requestsPerDay: 1_000,
        reservedRequests: 50,
      }),
      { requestsPerMinute: 30, requestsPerDay: 1_000, reservedRequests: 50 },
    );
  });
});
