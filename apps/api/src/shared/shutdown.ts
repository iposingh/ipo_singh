import type { Server } from "node:http";
import type { Logger } from "./logger.ts";
import type { AppState } from "./state.ts";

export type SignalSource = {
  on(signal: NodeJS.Signals, listener: () => void): void;
};

export function createShutdown(
  server: Server,
  state: AppState,
  logger: Logger,
  timeoutMs: number,
  cleanup: () => Promise<void> = async () => undefined,
): () => Promise<boolean> {
  let pending: Promise<boolean> | null = null;

  return () => {
    if (pending) return pending;
    state.accepting = false;
    logger.info("API shutting down");
    pending = new Promise((resolve) => {
      let settled = false;
      const finish = (clean: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (clean) logger.info("API stopped");
        resolve(clean);
      };
      const timer = setTimeout(() => {
        logger.error("Shutdown timed out");
        finish(false);
      }, timeoutMs);
      timer.unref();
      server.closeIdleConnections();
      server.close(() => {
        cleanup().then(
          () => finish(true),
          (error: unknown) => {
            logger.error("Shutdown cleanup failed", {
              detail: error instanceof Error ? error.message : "unknown",
            });
            finish(false);
          },
        );
      });
    });
    return pending;
  };
}

export function registerProcessShutdown(
  source: SignalSource,
  shutdown: () => Promise<boolean>,
  logger: Logger,
  exit: (code: number) => void,
): void {
  let started = false;
  const handle = (signal: NodeJS.Signals) => {
    if (started) return;
    started = true;
    logger.info("Shutdown requested", { signal });
    shutdown().then(
      (clean) => exit(clean ? 0 : 1),
      () => exit(1),
    );
  };
  source.on("SIGTERM", () => handle("SIGTERM"));
  source.on("SIGINT", () => handle("SIGINT"));
}
