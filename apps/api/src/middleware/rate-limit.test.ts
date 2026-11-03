import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { createRateLimiter, internalServiceHeader } from "./rate-limit.ts";

function request(path: string, headers: Record<string, string> = {}): Request {
  return {
    method: "GET",
    originalUrl: path,
    path,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe("rate limiter", () => {
  it("limits admin routes by IP and skips them for a matching internal service token", () => {
    const policy = {
      windowMs: 60_000,
      cataloguePerWindow: 300,
      searchPerWindow: 60,
      detailPerWindow: 120,
      authPerWindow: 10,
      adminPerWindow: 2,
    };
    const now = 1_000;
    const limiter = createRateLimiter(policy, {
      now: () => now,
      internalServiceToken: "internal-service-token",
    });
    const headers: string[] = [];
    const res = {
      setHeader(name: string, value: string) {
        headers.push(`${name}:${value}`);
      },
    } as unknown as Response;

    let nextCount = 0;
    const next = () => {
      nextCount += 1;
    };
    let error: unknown;
    const fail = (err: unknown) => {
      error = err;
    };

    limiter(request("/api/v1/admin/session"), res, next);
    limiter(request("/api/v1/admin/banners"), res, next);
    assert.equal(nextCount, 2);
    limiter(request("/api/v1/admin/dashboard"), res, fail);
    assert.ok(error);

    error = undefined;
    nextCount = 0;
    limiter(request("/api/v1/admin/dashboard", { [internalServiceHeader]: "internal-service-token" }), res, next);
    assert.equal(nextCount, 1);
    assert.equal(error, undefined);

    // Auth remains limited even with the internal header.
    nextCount = 0;
    error = undefined;
    const authLimiter = createRateLimiter(
      { ...policy, authPerWindow: 1 },
      { now: () => now, internalServiceToken: "internal-service-token" },
    );
    authLimiter(request("/api/v1/auth/login", { [internalServiceHeader]: "internal-service-token" }), res, next);
    authLimiter(request("/api/v1/auth/login", { [internalServiceHeader]: "internal-service-token" }), res, fail);
    assert.equal(nextCount, 1);
    assert.ok(error);
  });
});
