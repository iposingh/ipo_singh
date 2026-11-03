import assert from "node:assert/strict";
import test from "node:test";
import type { PublicPromotionResponse } from "@ipo-singh/contracts";
import { cachePolicies, memoryJsonCache } from "../catalogue/response-cache.ts";
import {
  promotionEventBody,
  resetPromotionAnalyticsForTests,
  shouldRecordImpression,
  trackPromotionEvent,
} from "./analytics.ts";
import { loadPromotions, promotionOfflineNote, promotionRefreshNote } from "./load.ts";
import {
  autoplayAllowed,
  bannerFrame,
  bannersFromResponse,
  houseBanners,
  nextSlideIndex,
  promotionAccessibilityLabel,
  promotionAutoplayMs,
  promotionDestination,
  promotionImageCachePolicy,
  promotionImageUrl,
} from "./model.ts";

type PublicPromotionSlide = PublicPromotionResponse["slides"][number];

const origin = "http://127.0.0.1:4000";
const imageId = "image-0123456789abcdef";

function slide(overrides: Partial<PublicPromotionSlide> & Pick<PublicPromotionSlide, "id" | "href" | "disclosure">): PublicPromotionSlide {
  return {
    title: "Stored offer",
    description: "A managed banner stored by IPO Singh.",
    image: {
      alt: "Offer image",
      desktop: { src: `/api/promotions/media/${imageId}`, width: 1200, height: 400 },
      mobile: { src: `/api/promotions/media/${imageId}`, width: 780, height: 520 },
    },
    ...overrides,
  };
}

function response(managed: boolean, slides: PublicPromotionSlide[]): PublicPromotionResponse {
  return { placement: "home", managed, slides };
}

test("house banners stay inside the app and a managed list keeps API order", () => {
  const house = houseBanners();
  assert.deepEqual(
    house.map((banner) => banner.destination),
    [
      { kind: "route", href: "/" },
      { kind: "route", href: "/(tabs)/sme" },
      { kind: "route", href: "/(tabs)/calendar" },
    ],
  );
  assert.equal(house.every((banner) => banner.label === "IPO Singh" && banner.disclosure === null && banner.image.kind === "brand"), true);

  const managed = bannersFromResponse(
    response(false, [slide({ id: "ignored", href: "/ipos/sme", disclosure: null })]),
    { origin, appEnv: "development" },
  );
  assert.deepEqual(managed.map((banner) => banner.id), ["mainboard", "sme", "calendar"]);

  const ordered = bannersFromResponse(
    response(true, [
      slide({ id: "later", href: "/ipos/fixture-mills", disclosure: null, title: "Zebra Mills" }),
      slide({ id: "first", href: "/ipo-calendar", disclosure: null, title: "Calendar" }),
    ]),
    { origin, appEnv: "development" },
  );
  assert.deepEqual(ordered.map((banner) => banner.id), ["later", "first"]);
  assert.deepEqual(ordered[0]?.destination, { kind: "ipo", slug: "fixture-mills" });
  assert.deepEqual(ordered[1]?.destination, { kind: "route", href: "/(tabs)/calendar" });
  assert.deepEqual(
    bannersFromResponse(response(true, []), { origin, appEnv: "development" }).map((banner) => banner.id),
    ["mainboard", "sme", "calendar"],
  );
});

test("banner navigation labels paid placements and refuses unsafe or app-store destinations", () => {
  const context = { origin, site: "https://iposigh.example", appEnv: "development" as const };
  const sponsored = slide({
    id: "paid",
    href: "https://example.com/offer?ref=home",
    disclosure: "sponsored",
    title: "Partner offer",
  });
  const banners = bannersFromResponse(response(true, [sponsored]), context);
  assert.equal(banners.length, 1);
  assert.equal(banners[0]?.label, "Sponsored");
  assert.deepEqual(banners[0]?.destination, { kind: "external", url: "https://example.com/offer?ref=home" });
  assert.equal(promotionAccessibilityLabel(banners[0]!, 0, 1).startsWith("Sponsored."), true);

  const advertisement = slide({ id: "ad", href: "https://example.com/ad", disclosure: "advertisement" });
  assert.equal(bannersFromResponse(response(true, [advertisement]), context)[0]?.label, "Advertisement");

  const dropped = [
    slide({ id: "store", href: "https://play.google.com/store/apps/details?id=com.iposigh", disclosure: "advertisement" }),
    slide({ id: "apple", href: "https://apps.apple.com/app/id1", disclosure: "sponsored" }),
    slide({ id: "itunes", href: "https://itunes.apple.com/app/id1", disclosure: "sponsored" }),
    slide({ id: "download", href: "/download", disclosure: null }),
    slide({ id: "http", href: "http://example.com/offer", disclosure: "advertisement" }),
    slide({ id: "secret", href: "https://user:pass@example.com/offer", disclosure: "advertisement" }),
    slide({ id: "vendor", href: "https://ipoguru.in/offer", disclosure: "sponsored" }),
    slide({ id: "local", href: "https://localhost/offer", disclosure: "advertisement" }),
    slide({ id: "house-external", href: "https://example.com/offer", disclosure: null }),
  ];
  assert.equal(bannersFromResponse(response(true, dropped), context).length, 0);
  assert.equal(promotionDestination("https://play.google.com/store/apps/details?id=com.iposigh", "advertisement", undefined, "development"), null);
  const paidIssue = bannersFromResponse(response(true, [slide({ id: "paid-issue", href: "/ipos/fixture-mills", disclosure: "sponsored" })]), context);
  assert.equal(paidIssue[0]?.label, "Sponsored");
  assert.deepEqual(paidIssue[0]?.destination, { kind: "ipo", slug: "fixture-mills" });

  const website = bannersFromResponse(response(true, [slide({ id: "about", href: "/about", disclosure: null })]), context);
  assert.deepEqual(website[0]?.destination, { kind: "website", url: "https://iposigh.example/about" });
  assert.equal(bannersFromResponse(response(true, [slide({ id: "about", href: "/about", disclosure: null })]), { origin, appEnv: "production" }).length, 0);
});

test("banner images use the API media route and a small screen stays under the height cap", () => {
  assert.equal(promotionImageUrl(origin, `/api/promotions/media/${imageId}`), `${origin}/api/v1/promotions/media/${imageId}`);
  assert.equal(promotionImageUrl(origin, `/api/admin/banners/media/${imageId}`), null);
  assert.equal(promotionImageUrl(origin, "/promotions/mainboard-mobile.svg"), null);
  assert.equal(promotionImageUrl("https://ipoguru.in", `/api/promotions/media/${imageId}`), null);
  assert.equal(promotionImageCachePolicy, "memory-disk");

  const narrow = bannerFrame(320 - 16 * 2);
  assert.equal(narrow.width, 288);
  assert.equal(narrow.height, Math.min(240, Math.round((288 * 520) / 780)));
  assert.ok(narrow.height < 240);
  assert.ok(narrow.height < 320);
  assert.equal(bannerFrame(1200).height, 240);
});

test("autoplay stays off for one slide, reduced motion, and a paused or hidden carousel", () => {
  const playing = { count: 2, paused: false, reducedMotion: false, interacting: false, focused: false, appActive: true };
  assert.equal(autoplayAllowed(playing), true);
  assert.equal(promotionAutoplayMs, 7_000);
  assert.equal(autoplayAllowed({ ...playing, count: 1 }), false);
  assert.equal(autoplayAllowed({ ...playing, reducedMotion: true }), false);
  assert.equal(autoplayAllowed({ ...playing, paused: true }), false);
  assert.equal(autoplayAllowed({ ...playing, interacting: true }), false);
  assert.equal(autoplayAllowed({ ...playing, focused: true }), false);
  assert.equal(autoplayAllowed({ ...playing, appActive: false }), false);
  assert.equal(nextSlideIndex(0, 3, 1), 1);
  assert.equal(nextSlideIndex(0, 3, -1), 2);
});

test("offline promotion loads use the saved response and an empty managed list falls back to house banners", async () => {
  const cache = memoryJsonCache();
  const now = new Date("2026-10-27T08:00:00.000Z");
  const body = response(true, [slide({ id: "saved", href: "/ipos/sme", disclosure: null })]);
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  };

  const online = await loadPromotions({ origin, appEnv: "development", offline: false, cache, now, fetchImpl });
  assert.deepEqual(online.banners.map((banner) => banner.id), ["saved"]);
  assert.equal(online.notice, null);
  assert.equal(online.banners[0]?.image.kind === "remote" && online.banners[0].image.url, `${origin}/api/v1/promotions/media/${imageId}`);

  const reused = await loadPromotions({ origin, appEnv: "development", offline: false, cache, now: new Date(now.getTime() + 60_000), fetchImpl });
  assert.equal(calls, 1);
  assert.deepEqual(reused.banners.map((banner) => banner.id), ["saved"]);
  assert.equal(reused.notice, null);

  const offline = await loadPromotions({ origin, appEnv: "development", offline: true, cache, now: new Date(now.getTime() + 60_000), fetchImpl });
  assert.equal(calls, 1);
  assert.deepEqual(offline.banners.map((banner) => banner.id), ["saved"]);
  assert.equal(offline.notice, promotionOfflineNote);

  const failed: typeof fetch = () => Promise.resolve(new Response("nope", { status: 503 }));
  const refreshed = await loadPromotions({
    origin,
    appEnv: "development",
    offline: false,
    cache,
    now: new Date(now.getTime() + cachePolicies.promotions.freshMs + 1),
    fetchImpl: failed,
  });
  assert.deepEqual(refreshed.banners.map((banner) => banner.id), ["saved"]);
  assert.equal(refreshed.notice, promotionRefreshNote);

  let flightCalls = 0;
  let release: (response: Response) => void = () => undefined;
  const gate = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const flightCache = memoryJsonCache();
  const flightFetch: typeof fetch = () => {
    flightCalls += 1;
    return gate;
  };
  const flightNow = new Date("2026-10-28T08:00:00.000Z");
  const firstFlight = loadPromotions({ origin, appEnv: "development", offline: false, cache: flightCache, now: flightNow, fetchImpl: flightFetch });
  const secondFlight = loadPromotions({ origin, appEnv: "development", offline: false, cache: flightCache, now: flightNow, fetchImpl: flightFetch });
  release(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  await Promise.all([firstFlight, secondFlight]);
  assert.equal(flightCalls, 1);

  const emptyCache = memoryJsonCache();
  const cold = await loadPromotions({ origin, appEnv: "development", offline: true, cache: emptyCache, now, fetchImpl });
  assert.deepEqual(cold.banners.map((banner) => banner.id), ["mainboard", "sme", "calendar"]);
  assert.equal(cold.notice, null);

  const emptyBody = response(true, []);
  const emptyFetch: typeof fetch = () => Promise.resolve(new Response(JSON.stringify(emptyBody), { status: 200 }));
  const hidden = await loadPromotions({ origin, appEnv: "development", offline: false, cache: emptyCache, now, fetchImpl: emptyFetch });
  assert.deepEqual(hidden.banners.map((banner) => banner.id), ["mainboard", "sme", "calendar"]);
  assert.equal(hidden.notice, null);
  const hiddenOffline = await loadPromotions({ origin, appEnv: "development", offline: true, cache: emptyCache, now, fetchImpl: emptyFetch });
  assert.deepEqual(hiddenOffline.banners.map((banner) => banner.id), ["mainboard", "sme", "calendar"]);
  assert.equal(hiddenOffline.notice, promotionOfflineNote);

  const expired = await loadPromotions({
    origin,
    appEnv: "development",
    offline: true,
    cache,
    now: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
    fetchImpl,
  });
  assert.equal(calls, 1);
  assert.deepEqual(expired.banners.map((banner) => banner.id), ["mainboard", "sme", "calendar"]);
  assert.equal(expired.notice, null);
});

test("promotion analytics stay aggregate-only and dedupe impressions", async () => {
  resetPromotionAnalyticsForTests();
  assert.equal(promotionEventBody({ bannerId: "mainboard", event: "impression", placement: "home" })?.bannerId, "mainboard");
  assert.equal(promotionEventBody({ bannerId: "Bad Id", event: "click", placement: "home" }), null);
  assert.equal(shouldRecordImpression("mainboard"), true);
  assert.equal(shouldRecordImpression("mainboard"), false);

  let bodies: string[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    bodies.push(String(init?.body ?? ""));
    return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
  };
  assert.equal(await trackPromotionEvent({ origin, bannerId: "paid-offer", event: "click", fetchImpl }), "sent");
  assert.equal(await trackPromotionEvent({ origin, bannerId: "paid-offer", event: "impression", fetchImpl }), "sent");
  assert.equal(await trackPromotionEvent({ origin, bannerId: "paid-offer", event: "impression", fetchImpl }), "skipped");
  assert.deepEqual(bodies.map((body) => JSON.parse(body).event), ["click", "impression"]);

  const missing: typeof fetch = () => Promise.resolve(new Response("gone", { status: 404 }));
  assert.equal(await trackPromotionEvent({ origin, bannerId: "other", event: "click", fetchImpl: missing }), "unavailable");
});
