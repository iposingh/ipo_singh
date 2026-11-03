import assert from "node:assert/strict";
import test from "node:test";
import { officialAllotmentUrl, officialHttpUrl } from "./official-url.ts";

test("allotment links stay on verified registrar pages", () => {
  assert.equal(
    officialAllotmentUrl({
      name: "Bigshare Services Private Limited",
      allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    }),
    "https://ipo.bigshareonline.com/ipo_status.html",
  );
  assert.equal(officialAllotmentUrl({ name: "KFin Technologies Limited", allotmentUrl: "https://ipostatus.kfintech.com/" }), "https://ipostatus.kfintech.com/");
  assert.equal(
    officialAllotmentUrl({ name: "KFin Technologies Limited", allotmentUrl: "https://registrar.example/status" }),
    "https://ipostatus.kfintech.com/",
  );
  assert.equal(officialAllotmentUrl({ name: "KFin Technologies Limited", allotmentUrl: null }), "https://ipostatus.kfintech.com/");
  assert.equal(officialAllotmentUrl({ name: "Sample Registrar", allotmentUrl: "https://registrar.example/allotment" }), null);
  assert.equal(officialAllotmentUrl({ name: "Sample Registrar", allotmentUrl: null }), null);
  assert.equal(officialHttpUrl("javascript:alert(1)"), null);
  assert.equal(officialHttpUrl("https://user:secret@registrar.example"), null);
  assert.equal(officialAllotmentUrl({ name: null, allotmentUrl: null }), null);
});
