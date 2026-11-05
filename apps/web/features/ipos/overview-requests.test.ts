import assert from "node:assert/strict";
import test from "node:test";
import type { IpoSummary } from "@ipo-singh/contracts";
import { loadListingSummaries } from "../../lib/api/ipo-singh.ts";
import { listingSections, sectionPreviewLimit } from "./listing-sections.ts";

const summary = (overrides: Partial<IpoSummary> & Pick<IpoSummary, "id" | "slug" | "status">): IpoSummary => ({
  companyName: overrides.companyName ?? overrides.slug,
  board: overrides.board ?? "mainboard",
  openDate: "2026-10-01",
  closeDate: "2026-10-03",
  gmpAmountRupees: null,
  subscriptionTotalTimes: null,
  provenance: { sourceName: "IPO Singh", retrievedAt: null, freshness: "missing" },
  listingDate: overrides.status === "listed" ? "2026-10-08" : null,
  listingPriceRupees: overrides.status === "listed" ? 120 : null,
  listingIssuePriceRupees: overrides.status === "listed" ? 100 : null,
  listingGainPercent: overrides.status === "listed" ? 20 : null,
  cmpRupees: overrides.status === "listed" ? 130 : null,
  currentGainPercent: overrides.status === "listed" ? 8.33 : null,
  issuePriceRupees: 100,
  ...overrides,
});

test("board overview keeps four section requests and Prompt 90A listing fields", async () => {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    const status = new URL(url).searchParams.get("status") ?? "open";
    return Response.json({
      items: [
        summary({
          id: `${status}-mills`,
          slug: `${status}-mills`,
          status: status as IpoSummary["status"],
          board: "mainboard",
        }),
      ],
      page: { limit: sectionPreviewLimit, nextCursor: null, totalCount: 1 },
    });
  };

  const sections = await Promise.all(
    listingSections("mainboard").map(async (section) => {
      const loaded = await loadListingSummaries(
        {
          board: "mainboard",
          status: section.query.status === "all" ? undefined : section.query.status,
          sort: section.query.sort,
          direction: section.query.direction,
          page: 1,
          limit: sectionPreviewLimit,
        },
        { origin: "http://127.0.0.1:4000", fetch: fetchImpl },
      );
      return { section, loaded };
    }),
  );

  assert.equal(sections.length, 4);
  assert.equal(urls.length, 4);
  assert.equal(urls.every((url) => url.includes("/api/v1/ipos?")), true);
  assert.equal(urls.some((url) => /\/api\/v1\/ipos\/[^?]+$/.test(url)), false);
  assert.deepEqual(
    sections.map((item) => item.section.id),
    ["open", "upcoming", "closed", "listed"],
  );
  const listed = sections.find((item) => item.section.id === "listed")?.loaded.items[0];
  assert.equal(listed?.listingGainPercent, 20);
  assert.equal(listed?.cmpRupees, 130);
  assert.equal(listed?.currentGainPercent, 8.33);
  assert.equal(listed?.listingPriceRupees, 120);
});
