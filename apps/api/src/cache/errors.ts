export class CachePolicyError extends Error {
  readonly reason: "sensitive-key" | "sensitive-value" | "ttl";

  constructor(reason: "sensitive-key" | "sensitive-value" | "ttl") {
    super(
      reason === "sensitive-key"
        ? "Cache key is not allowed."
        : reason === "ttl"
          ? "Cache freshness exceeds the stale window."
          : "Cache value is not allowed.",
    );
    this.name = "CachePolicyError";
    this.reason = reason;
  }
}

export class CacheStormError extends Error {
  constructor() {
    super("Cache misses are temporarily paused.");
    this.name = "CacheStormError";
  }
}
