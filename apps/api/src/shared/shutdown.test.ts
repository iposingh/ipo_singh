import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { createLogger } from "./logger.ts";
import type { AppState } from "./state.ts";
import { createShutdown, registerProcessShutdown } from "./shutdown.ts";

const logger = createLogger({ level: "error", service: "test", sink: () => undefined });

describe("shutdown", () => {
  it("stops accepting traffic once and closes the server", async () => {
    const server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const state: AppState = { accepting: true };
    const shutdown = createShutdown(server, state, logger, 1000);
    const first = shutdown();
    const second = shutdown();
    assert.equal(state.accepting, false);
    assert.equal(second, first);
    assert.equal(await first, true);
  });

  it("closes dependencies after the server stops", async () => {
    const server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    let closed = false;
    const shutdown = createShutdown(server, { accepting: true }, logger, 1000, async () => {
      closed = true;
    });
    assert.equal(await shutdown(), true);
    assert.equal(closed, true);
  });

  it("runs shutdown once when both stop signals arrive", async () => {
    const source = new EventEmitter();
    let calls = 0;
    let exitCode: number | undefined;
    registerProcessShutdown(
      source,
      () => {
        calls += 1;
        return Promise.resolve(true);
      },
      logger,
      (code) => {
        exitCode = code;
      },
    );
    source.emit("SIGTERM");
    source.emit("SIGINT");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls, 1);
    assert.equal(exitCode, 0);
  });
});
