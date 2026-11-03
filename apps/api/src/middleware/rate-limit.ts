import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { RateLimitPolicy } from "../config/http-limits.ts";
import { HttpError } from "../shared/errors.ts";

type Bucket = { count: number; window: number };
type LimitKind = "catalogue" | "search" | "detail" | "auth" | "admin";

const maxBuckets = 10_000;
export const internalServiceHeader = "x-ipo-singh-internal";

function classify(path: string): "exempt" | LimitKind {
  if (path === "/api/v1/health" || path === "/api/v1/ready") return "exempt";
  if (path === "/api/v1/search") return "search";
  if (path.startsWith("/api/v1/ipos/") && path.length > "/api/v1/ipos/".length) return "detail";
  if (path === "/api/v1/auth" || path.startsWith("/api/v1/auth/")) return "auth";
  // Anonymous device push registration is a write surface — share the auth budget.
  if (
    path === "/api/v1/notifications/device-push-tokens" ||
    path === "/api/v1/notifications/device-push-preferences"
  ) {
    return "auth";
  }
  if (path === "/api/v1/admin" || path.startsWith("/api/v1/admin/")) return "admin";
  return "catalogue";
}

function limitFor(policy: RateLimitPolicy, kind: LimitKind): number {
  if (kind === "search") return policy.searchPerWindow;
  if (kind === "detail") return policy.detailPerWindow;
  if (kind === "auth") return policy.authPerWindow;
  if (kind === "admin") return policy.adminPerWindow;
  return policy.cataloguePerWindow;
}

function tokensMatch(expected: string | null, provided: string | undefined): boolean {
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type RateLimiterOptions = {
  now?: () => number;
  /** When set, matching `x-ipo-singh-internal` skips catalogue/search/detail/admin budgets. Auth stays limited. */
  internalServiceToken?: string | null;
};

export function createRateLimiter(policy: RateLimitPolicy, options: RateLimiterOptions = {}) {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;
  const internalToken = options.internalServiceToken ?? null;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.method === "OPTIONS") {
      next();
      return;
    }
    const path = req.originalUrl.split("?")[0] || req.path;
    const kind = classify(path);
    if (kind === "exempt") {
      next();
      return;
    }

    // Next.js SSR/BFF presents a shared secret so one website host is not treated as one abusive client.
    // Login/register remain on the auth budget even with the header.
    if (kind !== "auth" && tokensMatch(internalToken, req.get(internalServiceHeader) ?? undefined)) {
      next();
      return;
    }

    const window = Math.floor(now() / policy.windowMs);
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${kind}\u0000${ip}`;
    const current = buckets.get(key);
    const bucket = current && current.window === window ? current : { count: 0, window };
    if (bucket.count >= limitFor(policy, kind)) {
      const retryAfterSeconds = Math.max(1, Math.ceil(((window + 1) * policy.windowMs - now()) / 1000));
      _res.setHeader("Retry-After", String(retryAfterSeconds));
      next(new HttpError(429, "rate_limited", "Too many requests. Try again shortly."));
      return;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > maxBuckets) {
      for (const [storedKey, stored] of buckets) {
        if (stored.window < window) buckets.delete(storedKey);
      }
    }
    next();
  };
}
