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
  assert.equal(verifiedAllotmentUrl({ name: "Cameo Corporate Services Ltd.", statusPage: "https://ipo.cameoindia.com/" }), "https://ipo.cameoindia.com/");
  assert.equal(
    verifiedAllotmentUrl({ name: "Maashitla Securities Pvt. Ltd.", statusPage: "https://maashitla.com/allotment-status/public-issues/" }),
    "https://maashitla.com/allotment-status/public-issues/",
  );
  // Vedant Poly Fabs / Johnsoncab references on IPOJi are not registrar portals.
  assert.equal(verifiedAllotmentUrl({ name: "Cameo", statusPage: "https://ipoji.com/ipo-allotment-status/vedant-poly-fabs-ipo" }), "https://ipo.cameoindia.com/");
  assert.equal(verifiedAllotmentUrl({ name: null, statusPage: "https://ipoji.com/ipo-allotment-status/vedant-poly-fabs-ipo" }), null);
  assert.equal(verifiedAllotmentUrl({ name: null, statusPage: "https://ipoji.com/ipo-allotment-status/johnsoncab-electricals-ipo" }), null);
  assert.equal(
    verifiedAllotmentUrl({ statusPage: "https://maashitla.com/allotment-status/public-issues/" }),
    "https://maashitla.com/allotment-status/public-issues/",
  );
});
