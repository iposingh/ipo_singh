import assert from "node:assert/strict";
import test from "node:test";
import { createHistoryClient } from "./history.ts";
import { gmpHistoryRequestPath, subscriptionHistoryRequestPath } from "./routes.ts";
import { historyCacheKey, memoryJsonCache, writeCached } from "./response-cache.ts";

const origin = "https://api.example.com";
const now = new Date("2026-10-26T12:00:00.000Z");
const slug = "fixture-polymers";
const provenance = { sourceName: "IPO Singh", retrievedAt: "2026-10-25T12:00:00.000Z", freshness: "fresh" as const };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function gmpBody(count: number) {
  return {
    ipoId: slug,
    provenance,
    window: { high: null, low: null, truncated: false, timelineLocked: false },
    observations: Array.from({ length: count }, (_, index) => ({
      observedAt: `2026-08-31T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      observedOn: "2026-08-31",
      amountRupees: index === 3 ? null : index,
      percent: index === 4 ? null : index,
      session: index % 2 === 0 ? "daily" : "intraday",
      slotLabel: null,
    })),
  };
}

test("GMP and subscription history stay on the IPO Singh API and keep an empty history empty", async () => {
  const urls: string[] = [];
  const client = createHistoryClient(memoryJsonCache());
  const gmp = await client.loadGmpHistory(slug, {
    origin,
    offline: false,
    now,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return json(gmpBody(0));
    },
  });
  const subscription = await client.loadSubscriptionHistory(slug, {
    origin,
    offline: false,
    now,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return json({ ipoId: slug, provenance, observations: [] });
    },
  });
  assert.deepEqual(urls, [`${origin}${gmpHistoryRequestPath(slug)}`, `${origin}${subscriptionHistoryRequestPath(slug)}`]);
  assert.equal(urls.some((url) => url.includes("ipoguru")), false);
  assert.equal(gmp.status, "ready");
  assert.equal(subscription.status, "ready");
  if (gmp.status === "ready") assert.equal(gmp.value.observations.length, 0);
  if (subscription.status === "ready") assert.equal(subscription.value.observations.length, 0);
});

test("a large stored history is kept and a malformed history does not become sample points", async () => {
  const client = createHistoryClient(memoryJsonCache());
  const loaded = await client.loadGmpHistory(slug, {
    origin,
    offline: false,
    now,
    fetchImpl: async () => json(gmpBody(400)),
  });
  assert.equal(loaded.status, "ready");
  if (loaded.status === "ready") {
    assert.equal(loaded.value.observations.length, 400);
    assert.equal(loaded.value.observations[3]?.amountRupees, null);
    assert.equal(loaded.value.observations[4]?.percent, null);
  }
  const malformed = await client.loadSubscriptionHistory(slug, {
    origin,
    offline: false,
    now,
    fetchImpl: async () => json({ observations: [{ totalTimes: 99 }] }),
  });
  assert.equal(malformed.status, "unavailable");
});

test("offline history uses the saved document and two reads share one request", async () => {
  const store = memoryJsonCache();
  const path = subscriptionHistoryRequestPath(slug);
  assert.ok(path);
  await writeCached(store, historyCacheKey("subscription", origin, slug), { ipoId: slug, provenance, observations: [] }, now);
  let calls = 0;
  const offline = await createHistoryClient(store).loadSubscriptionHistory(slug, {
    origin,
    offline: true,
    now,
    fetchImpl: async () => {
      calls += 1;
      return json({ ipoId: slug, provenance, observations: [] });
    },
  });
  assert.equal(calls, 0);
  assert.equal(offline.status, "ready");
  if (offline.status === "ready") assert.equal(offline.cacheReason, "offline");

  let liveCalls = 0;
  let release: (response: Response) => void = () => undefined;
  const gate = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const client = createHistoryClient(memoryJsonCache());
  const request = {
    origin,
    offline: false,
    now,
    fetchImpl: () => {
      liveCalls += 1;
      return gate;
    },
  };
  const first = client.loadGmpHistory(slug, request);
  const second = client.loadGmpHistory(slug, request);
  release(json(gmpBody(1)));
  const [left, right] = await Promise.all([first, second]);
  assert.equal(liveCalls, 1);
  assert.equal(left.status, "ready");
  assert.equal(right.status, "ready");
  if (left.status === "ready") assert.equal(left.value.observations.length, 1);
});
