import assert from "node:assert/strict";
import test from "node:test";
import { inspectPromotionImage } from "./images.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
]);

test("promotion uploads accept PNG and JPEG and reject markup and mismatched types", () => {
  assert.deepEqual(inspectPromotionImage("image/png", png), { contentType: "image/png", width: 1, height: 1 });
  assert.deepEqual(inspectPromotionImage("image/jpeg", jpeg), { contentType: "image/jpeg", width: 1, height: 1 });
  assert.equal(inspectPromotionImage("image/jpeg", png), null);
  assert.equal(inspectPromotionImage("image/svg+xml", Buffer.from("<svg><script>alert(1)</script></svg>")), null);
  assert.equal(inspectPromotionImage("text/plain", Buffer.from("not an image, but long enough to pass a short check")), null);
  assert.equal(inspectPromotionImage("image/png", Buffer.alloc(800_001, 1)), null);
});
