import assert from "node:assert/strict";
import test from "node:test";
import { appPromoDismissed, appPromoDismissKey, appPromoInitScript, appPromotionFromEnv, publishedStoreUrl } from "./app-promo.ts";

test("unpublished apps stay coming soon and invented hosts are refused", () => {
  const empty = appPromotionFromEnv({});
  assert.equal(empty.stores.every((store) => store.status === "coming-soon"), true);
  assert.equal(publishedStoreUrl("google-play", ""), null);
  assert.equal(publishedStoreUrl("google-play", "https://example.com/app"), null);
  assert.equal(publishedStoreUrl("google-play", "https://www.ipoguru.in/app"), null);
  assert.equal(publishedStoreUrl("app-store", "http://apps.apple.com/app/id1"), null);
  const play = "https://play.google.com/store/apps/details?id=in.example.app";
  assert.equal(publishedStoreUrl("google-play", play), play);
  const ready = appPromotionFromEnv({
    play: "https://play.google.com/store/apps/details/id",
    apple: "https://apps.apple.com/app/ipo-singh/id1",
  });
  assert.equal(ready.stores[0]?.status, "ready");
  assert.equal(ready.stores[1]?.status, "ready");
  if (ready.stores[0]?.status === "ready") assert.equal(ready.stores[0].url.startsWith("https://play.google.com/"), true);
});

test("dismissal lasts for the browser session only", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return saved.get(key) ?? null;
    },
  };
  assert.equal(appPromoDismissed(storage), false);
  saved.set(appPromoDismissKey, "dismissed");
  assert.equal(appPromoDismissed(storage), true);
  assert.equal(appPromoInitScript.includes(appPromoDismissKey), true);
  assert.equal(appPromoInitScript.includes("sessionStorage"), true);
  assert.equal(appPromoInitScript.includes("localStorage"), false);
});
