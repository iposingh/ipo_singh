export type CacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  compareAndDelete(key: string, value: string): Promise<boolean>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
};

export type CounterStore = {
  increment(key: string, ttlMs: number): Promise<number>;
  /** Current count for a quota window. Zero when the window has no requests. */
  read(key: string): Promise<number | null>;
};
