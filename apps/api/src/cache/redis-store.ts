/** Subset of the Redis command client used by the cache. Passwords stay in the connection URL. */
export type RedisCommandClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: "PX", ttlMs: number, setMode?: "NX"): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, matchMode: "MATCH", pattern: string, countMode: "COUNT", count: number): Promise<[string, string[]]>;
  eval(script: string, keyCount: number, ...args: string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<string>;
};

const unlockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export function createRedisStore(client: RedisCommandClient) {
  return {
    async get(key: string) {
      return client.get(key);
    },
    async set(key: string, value: string, ttlMs: number) {
      await client.set(key, value, "PX", ttlMs);
    },
    async deleteByPrefix(prefix: string) {
      let cursor = "0";
      do {
        const [next, keys] = await client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = next;
        if (keys.length > 0) await client.del(...keys);
      } while (cursor !== "0");
    },
    async setIfAbsent(key: string, value: string, ttlMs: number) {
      const result = await client.set(key, value, "PX", ttlMs, "NX");
      return result === "OK";
    },
    async compareAndDelete(key: string, value: string) {
      const removed = await client.eval(unlockScript, 1, key, value);
      return removed === 1;
    },
    async increment(key: string, ttlMs: number) {
      const count = await client.incr(key);
      if (count === 1) await client.pexpire(key, ttlMs);
      return count;
    },
    async read(key: string) {
      const raw = await client.get(key);
      if (raw === null) return 0;
      const parsed = Number(raw);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    },
    async ping() {
      return (await client.ping()) === "PONG";
    },
    async close() {
      await client.quit();
    },
  };
}
