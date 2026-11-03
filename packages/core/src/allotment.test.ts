import assert from "node:assert/strict";
import test from "node:test";
import { verifiedAllotmentUrl } from "./allotment.ts";

test("allotment links stay on the official KFin, MUFG Intime, and Bigshare pages", () => {
  assert.equal(
    verifiedAllotmentUrl({ name: "Bigshare Services Private Limited", slug: "bigshare-services", statusPage: "https://ipo.bigshareonline.com/ipo_status.html" }),
    "https://ipo.bigshareonline.com/ipo_status.html",
  );
  assert.equal(verifiedAllotmentUrl({ name: "KFin Technologies Limited", statusPage: "https://ipostatus.kfintech.com/" }), "https://ipostatus.kfintech.com/");
  assert.equal(verifiedAllotmentUrl({ name: "KFin Technologies Limited", statusPage: null }), "https://ipostatus.kfintech.com/");
  assert.equal(
    verifiedAllotmentUrl({ slug: "link-intime-india", statusPage: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html" }),
    "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
  );
  assert.equal(verifiedAllotmentUrl({ slug: "link-intime-india", statusPage: null }), "https://in.mpms.mufg.com/Initial_Offer/public-issues.html");
  assert.equal(verifiedAllotmentUrl({ name: "MUFG Intime India", statusPage: "https://evil.example/allotment" }), "https://in.mpms.mufg.com/Initial_Offer/public-issues.html");
  assert.equal(verifiedAllotmentUrl({ name: "Unknown Registrar", statusPage: "https://registrar.example/allotment" }), null);
  assert.equal(verifiedAllotmentUrl({ name: "Bigshare Services", statusPage: "https://user:secret@ipo.bigshareonline.com/ipo_status.html" }), "https://ipo.bigshareonline.com/ipo_status.html");
  assert.equal(verifiedAllotmentUrl({ name: null, slug: null, statusPage: null }), null);
});
