import type { CacheNamespace, CacheResource } from "../config/cache-policy.ts";
import { CachePolicyError } from "./errors.ts";

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,120}$/;
const sensitiveId = /(pan|application|applicant|user|account|session|credential|password|secret|token|authorization|cookie)/i;
const sensitiveField = /^(pan|applicationnumber|applicationno|applicant|userid|accountid|session|password|secret|token|authorization|cookie)$/i;

export function cacheKey(input: {
  version: number;
  namespace: CacheNamespace;
  resource: CacheResource;
  id: string;
  environment?: string;
}): string {
  if (!idPattern.test(input.id) || sensitiveId.test(input.id)) {
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
