import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultQuotaPolicy } from "../config/quota.ts";
import { createLogger } from "../shared/logger.ts";
import { createMemoryStore } from "../cache/memory-store.ts";
import { backoffDelayMs, createQuotaGate, ProviderOutageError, QuotaExhaustedError } from "./quota.ts";

describe("provider quota", () => {
  it("computes exponential backoff without jitter when random is zero", () => {
    assert.equal(backoffDelayMs(0, 200, 5_000, () => 0), 200);
    assert.equal(backoffDelayMs(1, 200, 5_000, () => 0), 400);
    assert.equal(backoffDelayMs(8, 200, 5_000, () => 0), 5_000);
  });

  it("stops normal traffic at the reserved day capacity and still allows a priority call", async () => {
    let now = Date.parse("2026-10-18T04:00:00.000Z");
    const gate = createQuotaGate({
      policy: {
        ...defaultQuotaPolicy(),
        requestsPerMinute: 20,
        requestsPerDay: 5,
        reservedRequests: 2,
        maxRetries: 0,
      },
      now: () => new Date(now),
      random: () => 0,
    });
    for (let index = 0; index < 3; index += 1) {
      assert.equal(await gate.run(async () => "ok"), "ok");
    }
    const used = await gate.snapshot();
    assert.equal(used.minuteUsed, 3);
    assert.equal(used.dayUsed, 3);
    await assert.rejects(() => gate.run(async () => "ok"), (error: unknown) => {
      assert.ok(error instanceof QuotaExhaustedError);
      assert.equal(error.window, "day");
      return true;
    });
    // The rejected call still occupies one slot, so one reserved unit remains.
    assert.equal(await gate.run(async () => "reserved", { priority: "reserved" }), "reserved");
    await assert.rejects(
      () => gate.run(async () => "reserved", { priority: "reserved" }),
      (error: unknown) => error instanceof QuotaExhaustedError && error.window === "day",
    );
    now += 60_000;
    await assert.rejects(
      () => gate.run(async () => "ok"),
      (error: unknown) => error instanceof QuotaExhaustedError && error.window === "day",
    );

    const reserved = createQuotaGate({
      policy: {
        ...defaultQuotaPolicy(),
        requestsPerMinute: 20,
        requestsPerDay: 5,
        reservedRequests: 2,
        maxRetries: 0,
      },
      now: () => new Date(now),
    });
    for (let index = 0; index < 3; index += 1) {
      assert.equal(await reserved.run(async () => "ok"), "ok");
    }
    assert.equal(await reserved.run(async () => "reserved", { priority: "reserved" }), "reserved");
    assert.equal(await reserved.run(async () => "reserved", { priority: "reserved" }), "reserved");
  });

  it("rejects once the minute window is full", async () => {
    const now = Date.parse("2026-10-18T04:00:00.000Z");
    const gate = createQuotaGate({
      policy: { ...defaultQuotaPolicy(), requestsPerMinute: 2, requestsPerDay: 100, reservedRequests: 0, maxRetries: 0 },
      now: () => new Date(now),
    });
    await gate.run(async () => "ok");
    await gate.run(async () => "ok");
    await assert.rejects(
      () => gate.run(async () => "ok"),
      (error: unknown) => error instanceof QuotaExhaustedError && error.window === "minute",
    );
  });

  it("waits with backoff and opens the circuit after repeated failures", async () => {
    let now = Date.parse("2026-10-18T04:00:00.000Z");
    const delays: number[] = [];
    const gate = createQuotaGate({
      policy: {
        ...defaultQuotaPolicy(),
        requestsPerMinute: 20,
        requestsPerDay: 100,
        reservedRequests: 0,
        maxRetries: 2,
        backoffBaseMs: 200,
        backoffMaxMs: 5_000,
        circuitFailures: 2,
        circuitOpenMs: 30_000,
      },
      now: () => new Date(now),
      sleep: async (ms) => {
        delays.push(ms);
      },
      random: () => 0,
    });
    await assert.rejects(
      () =>
        gate.run(async () => {
          throw new Error("upstream");
        }),
      (error: unknown) => error instanceof Error && error.message === "upstream",
    );
    assert.deepEqual(delays, [200]);
    await assert.rejects(() => gate.run(async () => "ok"), ProviderOutageError);
    now += 30_000;
    let release: (value: string) => void = () => undefined;
    const hold = new Promise<string>((resolve) => {
      release = resolve;
    });
    const trial = gate.run(async () => hold);
    await Promise.resolve();
    await assert.rejects(() => gate.run(async () => "second"), ProviderOutageError);
    release("probed");
    assert.equal(await trial, "probed");
    assert.equal(await gate.run(async () => "recovered"), "recovered");
  });

  it("uses a local counter when the distributed counter fails", async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "error", service: "test", sink: (line) => lines.push(line) });
    const gate = createQuotaGate({
      policy: { ...defaultQuotaPolicy(), requestsPerMinute: 1, requestsPerDay: 10, reservedRequests: 0, maxRetries: 0 },
      now: () => new Date(Date.parse("2026-10-18T04:00:00.000Z")),
      logger,
      counters: {
        async increment() {
          throw new Error("redis://:super-secret-value@127.0.0.1:6379");
        },
        async read() {
          throw new Error("redis://:super-secret-value@127.0.0.1:6379");
        },
      },
    });
    assert.equal(await gate.run(async () => "ok"), "ok");
    await assert.rejects(() => gate.run(async () => "ok"), QuotaExhaustedError);
    const logged = lines.join("\n");
    assert.match(logged, /Quota counter unavailable/);
    assert.equal(logged.includes("super-secret-value"), false);
  });

  it("does not retry a terminal failure or open the circuit for it", async () => {
    const delays: number[] = [];
    const gate = createQuotaGate({
      policy: {
        ...defaultQuotaPolicy(),
        requestsPerMinute: 10,
        requestsPerDay: 10,
        reservedRequests: 0,
        maxRetries: 2,
        circuitFailures: 1,
      },
      now: () => new Date(Date.parse("2026-10-18T04:00:00.000Z")),
      sleep: async (ms) => {
        delays.push(ms);
      },
      random: () => 0,
    });
    const terminal = new Error("plan");
    await assert.rejects(
      () =>
        gate.run(async () => {
          throw terminal;
        }, {
          retryable: () => false,
          outage: () => false,
        }),
      terminal,
    );
    assert.deepEqual(delays, []);
    assert.equal(await gate.run(async () => "ok"), "ok");
  });

  it("expires an in-memory counter after its TTL", async () => {
    let now = Date.parse("2026-10-18T04:00:00.000Z");
    const store = createMemoryStore(() => now);
    assert.equal(await store.increment("minute:1", 1_000), 1);
    now += 1_000;
    assert.equal(await store.increment("minute:1", 1_000), 1);
  });
});
