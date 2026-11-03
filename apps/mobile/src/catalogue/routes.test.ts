import assert from "node:assert/strict";
import test from "node:test";
import { issueRequestPath, issueRoute } from "./routes.ts";

test("a stored slug opens the IPO detail route", () => {
  assert.deepEqual(issueRoute("fixture-polymers"), { pathname: "/ipo/[slug]", params: { slug: "fixture-polymers" } });
  assert.equal(issueRequestPath("fixture-polymers"), "/api/v1/ipos/fixture-polymers");
  assert.equal(issueRoute("Fixture Polymers"), null);
  assert.equal(issueRequestPath("../guru"), null);
  assert.equal(issueRequestPath("fixture-polymers")?.includes("ipoguru"), false);
});
