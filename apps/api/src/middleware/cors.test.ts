import assert from "node:assert/strict";
import test from "node:test";
import { mobileAuthClientHeader } from "@ipo-singh/contracts";
import { corsAllowedHeaders } from "./cors.ts";

test("browsers are not allowed to request the native session header", () => {
  const allowed = corsAllowedHeaders.map((header) => header.toLowerCase());
  assert.equal(allowed.includes(mobileAuthClientHeader), false);
  assert.equal(allowed.includes("authorization"), true);
});
