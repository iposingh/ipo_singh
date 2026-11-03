import assert from "node:assert/strict";
import test from "node:test";
import { bannerDestination } from "./destination.ts";

test("house banners only accept internal paths", () => {
  assert.equal(bannerDestination("/ipos/mainboard", false), "/ipos/mainboard");
  assert.equal(bannerDestination("https://example.com/offer", false), null);
  assert.equal(bannerDestination("//evil.example", false), null);
});

test("sponsored banners accept public https and reject private or vendor hosts", () => {
  assert.equal(bannerDestination("https://example.com/offer", true), "https://example.com/offer");
  assert.equal(bannerDestination("https://www.ipoguru.in/offer", true), null);
  assert.equal(bannerDestination("https://127.0.0.1/offer", true), null);
  assert.equal(bannerDestination("https://169.254.169.254/latest/meta-data", true), null);
  assert.equal(bannerDestination("http://example.com/offer", true), null);
});
