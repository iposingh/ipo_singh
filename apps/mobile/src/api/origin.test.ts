import assert from "node:assert/strict";
import test from "node:test";
import { androidEmulatorApiOrigin, developmentApiOrigin, isLocalHost, readAppEnvironment, resolveApiOrigin } from "./origin.ts";

test("development uses the local API only when the origin is unset on a simulator", () => {
  assert.deepEqual(resolveApiOrigin("development", undefined), { ok: true, origin: developmentApiOrigin });
  assert.deepEqual(resolveApiOrigin("development", " http://192.168.1.20:4000 "), { ok: true, origin: "http://192.168.1.20:4000" });
  assert.deepEqual(resolveApiOrigin("development", androidEmulatorApiOrigin), { ok: true, origin: androidEmulatorApiOrigin });
  assert.equal(isLocalHost("127.0.0.1"), true);
  assert.equal(isLocalHost("192.168.1.20"), false);
  assert.equal(isLocalHost("10.0.2.2"), false);
});

test("a physical device refuses loopback and requires a LAN or public API origin", () => {
  assert.deepEqual(resolveApiOrigin("development", undefined, { isPhysicalDevice: true }), {
    ok: false,
    failure: "device-local",
  });
  assert.deepEqual(resolveApiOrigin("development", "http://127.0.0.1:4000", { isPhysicalDevice: true }), {
    ok: false,
    failure: "device-local",
  });
  assert.deepEqual(resolveApiOrigin("development", "http://localhost:4000", { isPhysicalDevice: true }), {
    ok: false,
    failure: "device-local",
  });
  assert.deepEqual(resolveApiOrigin("development", "http://192.168.1.20:4000", { isPhysicalDevice: true }), {
    ok: true,
    origin: "http://192.168.1.20:4000",
  });
});

test("preview and production require a public https origin", () => {
  assert.deepEqual(resolveApiOrigin("production", undefined), { ok: false, failure: "missing" });
  assert.deepEqual(resolveApiOrigin("preview", "http://127.0.0.1:4000"), { ok: false, failure: "local" });
  assert.deepEqual(resolveApiOrigin("production", "http://localhost:4000"), { ok: false, failure: "local" });
  assert.deepEqual(resolveApiOrigin("production", "https://api.example.com"), { ok: true, origin: "https://api.example.com" });
  assert.deepEqual(resolveApiOrigin("preview", "http://api.example.com"), { ok: false, failure: "invalid" });
});

test("preview and production refuse ephemeral tunnels that must not become the API origin", () => {
  assert.deepEqual(resolveApiOrigin("preview", "https://random-label.trycloudflare.com"), {
    ok: false,
    failure: "ephemeral",
  });
  assert.deepEqual(resolveApiOrigin("production", "https://abc.ngrok-free.app"), {
    ok: false,
    failure: "ephemeral",
  });
  assert.deepEqual(resolveApiOrigin("development", "https://smoke.trycloudflare.com"), {
    ok: true,
    origin: "https://smoke.trycloudflare.com",
  });
});

test("the data vendor address is refused in every environment", () => {
  for (const appEnv of ["development", "preview", "production"] as const) {
    assert.equal(resolveApiOrigin(appEnv, "https://www.ipoguru.in").ok, false);
    assert.deepEqual(resolveApiOrigin(appEnv, "https://api.ipoguru.in"), { ok: false, failure: "vendor" });
  }
  assert.deepEqual(resolveApiOrigin("development", "https://user:secret@api.example.com"), { ok: false, failure: "invalid" });
  assert.deepEqual(resolveApiOrigin("development", "https://api.example.com/v1"), { ok: false, failure: "invalid" });
});

test("an unknown environment fails closed outside development", () => {
  assert.equal(readAppEnvironment(undefined, true), "development");
  assert.equal(readAppEnvironment("preview", false), "preview");
  assert.equal(readAppEnvironment("staging", false), "production");
});
