/** Importing this module does not open a Redis connection. */
export { connectCache, createUnconfiguredCache } from "./connection.ts";
export type { CacheCheck, CacheHandle } from "./connection.ts";
export { createCacheService } from "./service.ts";
export type { CacheLoadOptions, CacheMetrics, CacheResult, CacheService } from "./service.ts";
