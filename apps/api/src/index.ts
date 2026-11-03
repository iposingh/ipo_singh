import { createServer } from "node:http";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import type { LoginAttemptLimiter } from "./accounts/attempts.ts";
import { bootstrapSuperAdmin } from "./accounts/bootstrap.ts";
import type { AdminManualSyncResult } from "@ipo-singh/contracts";
import { createArgon2Hasher, type PasswordHasher } from "./accounts/passwords.ts";
import type { IpoGuruClient } from "./providers/ipo-guru/client.ts";
import { connectCache, createUnconfiguredCache, type CacheHandle } from "./cache/connection.ts";
import type { AppConfig } from "./config/env.ts";
import { readConfig } from "./config/env.ts";
import { loadLocalEnv } from "./config/load-env.ts";
import { readPackageVersion } from "./config/version.ts";
import { connectDatabase } from "./db/connection.ts";
import type { DatabaseHandle } from "./db/handle.ts";
import { unconfiguredDatabase } from "./db/handle.ts";
import { ConfigError } from "./shared/errors.ts";
import { createLogger, type Logger } from "./shared/logger.ts";
import { redactString } from "./shared/redact.ts";
import { createShutdown, registerProcessShutdown } from "./shared/shutdown.ts";
import type { AppState } from "./shared/state.ts";

export type RunningServer = {
  url: string;
  port: number;
  state: AppState;
  shutdown: () => Promise<boolean>;
};

export async function startServer(
  config: AppConfig,
  logger: Logger,
  injected?: DatabaseHandle,
  injectedCache?: CacheHandle,
  ipoGuru?: IpoGuruClient,
  accounts?: { hasher?: PasswordHasher; attempts?: LoginAttemptLimiter; runCatalogSync?: () => Promise<AdminManualSyncResult> },
  bootstrapEnv: Record<string, string | undefined> = process.env,
): Promise<RunningServer> {
  const state: AppState = { accepting: true };
  let database: DatabaseHandle = unconfiguredDatabase;
  let opened = false;
  let cache: CacheHandle = createUnconfiguredCache(config.cache, config.quota, logger);
  let cacheOpened = false;
  try {
    if (injected) {
      database = injected;
    } else if (config.mongodb) {
      database = await connectDatabase(config, logger);
      opened = true;
    }
    if (injectedCache) {
      cache = injectedCache;
    } else if (config.redis) {
      cache = await connectCache(config.redis, config.cache, config.quota, logger);
      cacheOpened = true;
    }
    if (database.accounts) {
      await bootstrapSuperAdmin({
        store: database.accounts,
        audit: database.adminAudit,
        hasher: accounts?.hasher ?? createArgon2Hasher(),
        env: bootstrapEnv,
        logger,
      });
    }
  } catch (error) {
    if (opened) await database.close();
    if (cacheOpened) await cache.close();
    throw error;
  }

  const app = createApp(config, logger, state, database, cache, ipoGuru, accounts);
  const server = createServer(app);
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        server.off("listening", succeed);
        reject(error);
      };
      const succeed = () => {
        server.off("error", fail);
        resolve();
      };
      server.once("error", fail);
      server.once("listening", succeed);
      server.listen(config.port, config.host);
    });
  } catch (error) {
    if (opened) await database.close();
    if (cacheOpened) await cache.close();
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (opened) await database.close();
    if (cacheOpened) await cache.close();
    throw new Error("API did not bind a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    state,
    shutdown: createShutdown(server, state, logger, config.shutdownTimeoutMs, async () => {
      if (opened) await database.close();
      if (cacheOpened) await cache.close();
    }),
  };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const config = readConfig(process.env, readPackageVersion());
  const logger = createLogger({ level: config.logLevel, service: config.serviceName });
  const running = await startServer(config, logger);
  logger.info("API listening", { host: config.host, port: running.port });
  registerProcessShutdown(process, running.shutdown, logger, (code) => {
    process.exit(code);
  });
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    const detail =
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? redactString(error.message)
          : "startup failed";
    process.stderr.write(`${JSON.stringify({ level: "error", message: "API failed to start", detail })}\n`);
    process.exit(1);
  });
}
