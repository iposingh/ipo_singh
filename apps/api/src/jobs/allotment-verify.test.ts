import assert from "node:assert/strict";
import test from "node:test";
import { adminConfirmAllotment, unsupportedAllotmentVerification } from "./allotment-verify.ts";

test("automated verification stays unconfirmed without a permitted source", () => {
  const record = unsupportedAllotmentVerification({ ipoId: "eaaa-india-alternatives-ipo", now: new Date("2026-10-29T05:30:00.000Z") });
  assert.equal(record.allotmentConfirmed, false);
  assert.equal(record.verificationStatus, "unsupported");
  assert.match(record.note, /CAPTCHA|permitted/i);
});

test("administrator confirmation requires an evidence note", () => {
  assert.equal(
    "error" in
      adminConfirmAllotment({
        ipoId: "eaaa-india-alternatives-ipo",
        now: new Date("2026-10-29T05:30:00.000Z"),
        auditor: "ops",
        evidenceNote: "short",
      }),
    true,
  );
  const confirmed = adminConfirmAllotment({
    ipoId: "eaaa-india-alternatives-ipo",
    now: new Date("2026-10-29T05:30:00.000Z"),
    auditor: "ops-lead",
    evidenceNote: "Basis of allotment PDF published on the registrar portal for this IPO.",
  });
  assert.equal("error" in confirmed, false);
  if (!("error" in confirmed)) {
    assert.equal(confirmed.allotmentConfirmed, true);
    assert.equal(confirmed.verificationStatus, "confirmed");
  }
});
