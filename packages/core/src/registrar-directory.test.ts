import assert from "node:assert/strict";
import test from "node:test";
import { registrarPortalForName } from "./registrar-directory.ts";
import { verifiedAllotmentUrl } from "./allotment.ts";

test("registrar aliases resolve to verified general portals", () => {
  assert.equal(registrarPortalForName("KFin Technologies Limited"), "https://ipostatus.kfintech.com/");
  assert.equal(registrarPortalForName("MUFG Intime India Pvt.Ltd."), "https://in.mpms.mufg.com/Initial_Offer/public-issues.html");
  assert.equal(registrarPortalForName("Link Intime India Private Limited"), "https://in.mpms.mufg.com/Initial_Offer/public-issues.html");
  assert.equal(registrarPortalForName("Bigshare Services"), "https://ipo.bigshareonline.com/ipo_status.html");
  assert.equal(registrarPortalForName("Cameo Corporate Services Ltd."), "https://ipo.cameoindia.com/");
  assert.equal(registrarPortalForName("Maashitla Securities Pvt. Ltd."), "https://maashitla.com/allotment-status/public-issues/");
  assert.equal(registrarPortalForName("Unknown Registrar"), null);
});

test("directory portals pass the official host check", () => {
  const portal = registrarPortalForName("Bigshare Services");
  assert.equal(verifiedAllotmentUrl({ name: "Bigshare Services", statusPage: portal }), portal);
});
