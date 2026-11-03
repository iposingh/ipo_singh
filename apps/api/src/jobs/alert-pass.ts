import type { Logger } from "../shared/logger.ts";

/**
 * Runs one stored-data alert pass after synchronization.
 * A failed sync still allows the alert pass to use data already stored.
 * The alert pass does not call a data provider.
 */
export async function runWorkerTick(input: {
  sync: () => Promise<unknown>;
  alerts: () => Promise<unknown>;
  logger: Logger;
}): Promise<void> {
  try {
    await input.sync();
  } catch (error: unknown) {
    input.logger.error("Sync tick failed", { name: error instanceof Error ? error.name : "Error" });
  }
  await input.alerts();
}
