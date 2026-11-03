import assert from "node:assert/strict";
import test from "node:test";
import { readCsrfToken } from "./csrf.ts";

test("the page script can read the CSRF cookie and not the access cookie", () => {
  const header = "ipo_singh_access=access-secret; ipo_singh_csrf=csrf-value";
  assert.equal(readCsrfToken(header), "csrf-value");
  assert.equal(readCsrfToken("ipo_singh_access=access-secret"), null);
  assert.equal(readCsrfToken(null), null);
});
