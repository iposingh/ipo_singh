import assert from "node:assert/strict";
import test from "node:test";
import { articleImageLimit, inspectArticleImage } from "./images.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("article image inspection accepts PNG and rejects oversized or mismatched payloads", () => {
  assert.equal(articleImageLimit, 5_000_000);
  assert.deepEqual(inspectArticleImage("image/png", png), { contentType: "image/png", width: 1, height: 1 });
  assert.equal(inspectArticleImage("image/jpeg", png), null);
  assert.equal(inspectArticleImage("image/png", Buffer.alloc(0)), null);
  assert.equal(inspectArticleImage("image/png", Buffer.alloc(articleImageLimit + 1, 1)), null);
  assert.equal(inspectArticleImage("text/plain", png), null);
});
