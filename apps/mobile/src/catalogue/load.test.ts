import assert from "node:assert/strict";
import test from "node:test";
import { loadBoardPage, loadCalendarPage, loadSearchPage } from "./load.ts";

const origin = "https://api.example.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const emptyPage = { items: [], page: { limit: 20, nextCursor: null, totalCount: 0 } };

const summary = {
  id: "fixture-polymers",
  slug: "fixture-polymers",
  companyName: "Fixture Polymers",
  board: "mainboard",
  status: "open",
  openDate: "2026-10-20",
  closeDate: "2026-10-22",
  gmpAmountRupees: null,
  subscriptionTotalTimes: 0,
  provenance: {
    sourceName: "IPO Singh",
    retrievedAt: "2026-10-25T12:00:00.000Z",
    freshness: "fresh",
  },
};

test("board and calendar pages keep an empty catalogue empty", async () => {
  let boardUrl = "";
  const board = await loadBoardPage("mainboard", {
    origin,
    fetchImpl: async (url) => {
      boardUrl = String(url);
      return jsonResponse(emptyPage);
    },
  });
  assert.equal(boardUrl, `${origin}/api/v1/ipos?board=mainboard&limit=20`);
  assert.deepEqual(board, { status: "ready", items: [], nextCursor: null });

  const calendar = await loadCalendarPage({
    origin,
    fetchImpl: async () => jsonResponse(emptyPage),
  });
  assert.deepEqual(calendar, { status: "ready", items: [], nextCursor: null });
});

test("a stored summary keeps a missing GMP and a zero subscription", async () => {
  const result = await loadBoardPage("sme", {
    origin,
    cursor: "next",
    fetchImpl: async (url) => {
      assert.equal(String(url), `${origin}/api/v1/ipos?board=sme&limit=20&cursor=next`);
      return jsonResponse({ items: [{ ...summary, board: "sme" }], page: { limit: 20, nextCursor: null, totalCount: 1 } });
    },
  });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.items[0]?.gmpAmountRupees, null);
  assert.equal(result.items[0]?.subscriptionTotalTimes, 0);
  assert.equal(result.items[0]?.companyName, "Fixture Polymers");
});

test("search does not call the API for a short query and parses a real match", async () => {
  let calls = 0;
  const blocked = await loadSearchPage("a", {
    origin,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(emptyPage);
    },
  });
  assert.equal(calls, 0);
  assert.equal(blocked.status, "unavailable");

  const found = await loadSearchPage(" polymers ", {
    origin,
    fetchImpl: async (url) => {
      assert.equal(String(url), `${origin}/api/v1/search?q=polymers&limit=20`);
      return jsonResponse({ items: [summary], page: { limit: 20, nextCursor: "more", totalCount: null } });
    },
  });
  assert.equal(found.status, "ready");
  if (found.status === "ready") assert.equal(found.nextCursor, "more");
});

test("offline and malformed payloads do not invent issues", async () => {
  let calls = 0;
  const offline = await loadCalendarPage({
    origin,
    offline: true,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(emptyPage);
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(offline, { status: "offline" });

  const malformed = await loadBoardPage("mainboard", {
    origin,
    fetchImpl: async () => jsonResponse({ items: [{ companyName: "Sample Co" }] }),
  });
  assert.equal(malformed.status, "unavailable");
  if (malformed.status === "unavailable") assert.match(malformed.message, /unexpected/);
});
