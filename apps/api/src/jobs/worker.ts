import type { Logger } from "../shared/logger.ts";

export type SyncWorker = {
  start(): void;
  stop(): Promise<void>;
};

type Cancelable = {
  cancel(): void;
};

/**
 * Schedules synchronization on its own timer.
 * Calling this function does not start the timer. Website requests do not call it.
 */
export function createSyncWorker(options: {
  run: () => Promise<void>;
  tickMs: number;
  logger: Logger;
  schedule?: (ms: number, run: () => void) => Cancelable;
}): SyncWorker {
  const schedule =
    options.schedule ??
    ((ms, run) => {
      const timer = setTimeout(run, ms);
      timer.unref();
      return {
        cancel() {
          clearTimeout(timer);
        },
      };
    });
  let timer: Cancelable | null = null;
  let current: Promise<void> | null = null;
  let stopped = false;

  const arm = () => {
    if (stopped) return;
    timer = schedule(options.tickMs, () => {
      timer = null;
      if (stopped) return;
      current = options
        .run()
        .catch((error: unknown) => {
          options.logger.error("Sync tick failed", { name: error instanceof Error ? error.name : "Error" });
        })
        .finally(() => {
          current = null;
          arm();
        });
    });
  };

  return {
    start() {
      if (stopped || timer || current) return;
      arm();
    },
    async stop() {
      stopped = true;
      timer?.cancel();
      timer = null;
      if (current) await current;
    },
  };
}
