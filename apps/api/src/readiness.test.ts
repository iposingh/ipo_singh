import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { jobsStatus } from "./jobs/index.ts";
import { providerFeatures } from "./providers/capabilities.ts";
import { createIpoGuruProvider } from "./providers/ipo-guru/adapter.ts";
import { providerStatus } from "./providers/index.ts";

const root = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
  engines: { node: string };
  scripts: Record<string, string>;
};
const api = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  engines: { node: string };
  scripts: Record<string, string>;
};

describe("backend foundation", () => {
  it("runs on Node.js 24 and exposes the workspace scripts", () => {
    assert.equal(process.version.startsWith("v24."), true);
    assert.equal(root.engines.node, "24.x");
    assert.equal(api.engines.node, "24.x");
    for (const name of ["dev", "dev:api", "build", "start:api", "start:worker", "sync:once", "lint", "typecheck", "test"]) {
      assert.equal(typeof root.scripts[name], "string");
    }
    for (const name of ["dev", "build", "start", "start:worker", "sync:once", "lint", "typecheck", "test"]) {
      assert.equal(typeof api.scripts[name], "string");
    }
  });

  it("keeps IPO Guru disconnected and the API process out of the worker", () => {
    const provider = createIpoGuruProvider();
    assert.equal(providerStatus, "not_configured");
    assert.equal(jobsStatus, "not_configured");
    for (const feature of providerFeatures) {
      assert.equal(provider.capabilities[feature], "unverified");
    }
  });
});
