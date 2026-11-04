import type { CacheNamespace, CacheResource } from "../config/cache-policy.ts";
import { CachePolicyError } from "./errors.ts";

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,120}$/;
/**
 * Sensitive cache-id tokens. Matched as whole hyphen/underscore/colon/dot segments
 * so legitimate IPO slugs that merely contain letter sequences like "pan" inside
 * "company" or "japan" are not rejected.
 */
const sensitiveSegments = new Set([
  "pan",
  "application",
  "applicant",
  "user",
  "account",
  "session",
  "credential",
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
]);
const sensitiveField = /^(pan|applicationnumber|applicationno|applicant|userid|accountid|session|password|secret|token|authorization|cookie)$/i;

/** True when any delimited segment of the id is a reserved sensitive token. */
export function hasSensitiveCacheId(id: string): boolean {
  if (!id) return true;
  const normalized = id.trim().toLowerCase();
  if (sensitiveSegments.has(normalized)) return true;
  return normalized.split(/[._:-]+/).some((part) => part.length > 0 && sensitiveSegments.has(part));
}

export function cacheKey(input: {
  version: number;
  namespace: CacheNamespace;
  resource: CacheResource;
  id: string;
  environment?: string;
}): string {
  if (!idPattern.test(input.id) || hasSensitiveCacheId(input.id)) {
    throw new CachePolicyError("sensitive-key");
  }
  const environment = input.environment?.trim() || "dev";
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(environment)) {
    throw new CachePolicyError("sensitive-key");
  }
  return `ipo-singh:${environment}:v${input.version}:${input.namespace}:${input.resource}:${input.id}`;
}

export function containsSensitiveField(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveField(item, depth + 1));
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveField.test(key.replace(/[_-]/g, ""))) return true;
    if (containsSensitiveField(item, depth + 1)) return true;
  }
  return false;
}
