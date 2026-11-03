import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedNetworkHostname, parsePublicHttpsUrl } from "./public-https-url.ts";

test("blocks loopback, private, link-local, and metadata hostnames", () => {
  assert.equal(isBlockedNetworkHostname("127.0.0.1"), true);
  assert.equal(isBlockedNetworkHostname("10.0.0.8"), true);
  assert.equal(isBlockedNetworkHostname("192.168.1.1"), true);
  assert.equal(isBlockedNetworkHostname("169.254.169.254"), true);
  assert.equal(isBlockedNetworkHostname("localhost"), true);
  assert.equal(isBlockedNetworkHostname("metadata.google.internal"), true);
  assert.equal(isBlockedNetworkHostname("ipoguru.in"), true);
  assert.equal(isBlockedNetworkHostname("api.ipoguru.in"), true);
});

test("allows ordinary public DNS names over https only", () => {
  assert.equal(isBlockedNetworkHostname("in.mpms.mufg.com"), false);
  assert.equal(parsePublicHttpsUrl("https://in.mpms.mufg.com/path")?.hostname, "in.mpms.mufg.com");
  assert.equal(parsePublicHttpsUrl("http://in.mpms.mufg.com/path"), null);
  assert.equal(parsePublicHttpsUrl("https://user:pass@example.com/"), null);
  assert.equal(parsePublicHttpsUrl("https://127.0.0.1/"), null);
});
