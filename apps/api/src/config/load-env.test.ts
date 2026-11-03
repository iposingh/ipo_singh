import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadLocalEnv } from "./load-env.ts";

const marker = "IPO_SINGH_TEST_ENV_MARKER";
const directories: string[] = [];

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("loadLocalEnv", () => {
  const previousMarker = process.env[marker];
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    restore(marker, previousMarker);
    restore("NODE_ENV", previousNodeEnv);
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("loads a local file without replacing variables that are already set", () => {
    delete process.env[marker];
    process.env.NODE_ENV = "development";
    const directory = mkdtempSync(join(tmpdir(), "ipo-singh-api-"));
    directories.push(directory);
    writeFileSync(join(directory, ".env"), `${marker}=loaded\n`);
    loadLocalEnv(directory);
    assert.equal(process.env[marker], "loaded");

    writeFileSync(join(directory, ".env"), `${marker}=changed\n`);
    loadLocalEnv(directory);
    assert.equal(process.env[marker], "loaded");
  });

  it("ignores a local file when the process is production", () => {
    delete process.env[marker];
    process.env.NODE_ENV = "production";
    const directory = mkdtempSync(join(tmpdir(), "ipo-singh-api-"));
    directories.push(directory);
    writeFileSync(join(directory, ".env"), `${marker}=loaded\n`);
    loadLocalEnv(directory);
    assert.equal(process.env[marker], undefined);
  });
});
