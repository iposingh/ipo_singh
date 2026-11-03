import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAnchors } from "./anchors.ts";

describe("IPO Guru anchors", () => {
  it("keeps crore amounts and does not invent investors for an empty book", () => {
    const empty = mapAnchors({ anchors: [], summary: { total_anchors: 0, total_amount_cr: null, mutual_fund_count: 0 } });
    assert.ok(empty);
    assert.equal(empty.investors.length, 0);
    assert.equal(empty.totalAmountCrore, null);
    const mapped = mapAnchors({
      anchors: [
        {
          name: "Sample Anchor",
          group_entity: "Sample Group",
          shares_allotted: 1000,
          amount_cr: 1.5,
          pct_allocated: 12.5,
          pct_allotment_of_issue: 2,
        },
      ],
      summary: { total_anchors: 1, total_amount_cr: 1.5, mutual_fund_count: 0 },
    });
    assert.equal(mapped?.investors[0]?.amountCrore, 1.5);
    assert.equal(mapped?.investors[0]?.shares, 1000);
    assert.equal(mapped?.investors[0]?.group, "Sample Group");
    assert.equal(mapAnchors({ name: "Missing book" }), null);
  });
});
