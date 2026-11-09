import assert from "node:assert/strict";
import test from "node:test";
import { articleFinancialDisclaimer, publicArticleListSchema, type PublicArticleSummary } from "@ipo-singh/contracts";
import { memoryJsonCache } from "../catalogue/response-cache.ts";
import { articleDetailCacheKey, articleListCacheKey, articleOfflineNote, loadArticleDetail, loadArticleList } from "./load.ts";
import {
  articleBodyParagraphs,
  articleCardAccessibilityLabel,
  articleCategoryText,
  articleDetailPath,
  articlePublishedLabel,
  articlesPath,
} from "./model.ts";

const summary: PublicArticleSummary = {
  id: "what-is-gmp",
  slug: "what-is-grey-market-premium",
  title: "What is Grey Market Premium (GMP)?",
  summary: "An educational overview of unofficial grey-market premiums.",
  category: "gmp-updates",
  authorName: "IPO Singh Editorial",
  sourceName: "IPO Singh",
  publishedAt: "2026-10-20T04:30:00.000Z",
  updatedAt: "2026-10-20T04:30:00.000Z",
  cover: null,
  evergreen: true,
};

test("article paths, categories, and sanitized paragraphs stay editorial-safe", () => {
  assert.equal(articlesPath(), "/api/v1/articles");
  assert.equal(articlesPath({ category: "allotment-updates", q: " allotment " }), "/api/v1/articles?category=allotment-updates&q=allotment");
  assert.equal(articleDetailPath("what-is-grey-market-premium"), "/api/v1/articles/what-is-grey-market-premium");
  assert.equal(articleDetailPath("../secret"), null);
  assert.equal(articleCategoryText("ipo-updates"), "IPO Updates");
  assert.equal(articleCategoryText("gmp-updates"), "GMP Updates");
  assert.equal(articlePublishedLabel(summary.publishedAt), "20 Oct 2026");
  assert.match(articleCardAccessibilityLabel(summary), /Source IPO Singh/);
  assert.deepEqual(articleBodyParagraphs("One.\n\nTwo <b>bold</b>."), ["One.", "Two bold."]);
  assert.match(articleFinancialDisclaimer, /not investment advice/i);
});

test("article loads cache offline and leave an empty published list empty", async () => {
  const origin = "http://127.0.0.1:4000";
  const cache = memoryJsonCache();
  const now = new Date("2026-10-27T08:00:00.000Z");
  const body = publicArticleListSchema.parse({
    items: [summary],
    disclaimer: articleFinancialDisclaimer,
    nextCursor: null,
  });
  let calls = 0;
  const fetchImpl: typeof fetch = (input) => {
    calls += 1;
    const url = String(input);
    if (url.includes("/api/v1/articles/what-is-grey-market-premium")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            article: {
              ...summary,
              bodyMarkdown: "Educational only.\n\nNo invented news.",
              relatedIpoSlugs: [],
              citations: [],
            },
            disclaimer: articleFinancialDisclaimer,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    if (url.includes("/api/v1/articles")) {
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  };

  const online = await loadArticleList({ origin, offline: false, cache, now, fetchImpl });
  assert.equal(online.status, "ready");
  if (online.status === "ready") {
    assert.equal(online.items.length, 1);
    assert.equal(online.notice, null);
  }

  const reused = await loadArticleList({ origin, offline: false, cache, now: new Date(now.getTime() + 60_000), fetchImpl });
  assert.equal(calls, 1);
  assert.equal(reused.status, "ready");

  const offline = await loadArticleList({ origin, offline: true, cache, now: new Date(now.getTime() + 60_000), fetchImpl });
  assert.equal(calls, 1);
  assert.equal(offline.status, "ready");
  if (offline.status === "ready") assert.equal(offline.notice, articleOfflineNote);

  const emptyCache = memoryJsonCache();
  const emptyFetch: typeof fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ items: [], disclaimer: articleFinancialDisclaimer }), { status: 200 }));
  const empty = await loadArticleList({ origin, offline: false, cache: emptyCache, now, fetchImpl: emptyFetch });
  assert.equal(empty.status, "ready");
  if (empty.status === "ready") assert.deepEqual(empty.items, []);

  const detail = await loadArticleDetail({ origin, slug: "what-is-grey-market-premium", offline: false, cache, now, fetchImpl });
  assert.equal(detail.status, "ready");
  if (detail.status === "ready") {
    assert.equal(detail.article.bodyMarkdown.includes("<"), false);
    assert.deepEqual(articleBodyParagraphs(detail.article.bodyMarkdown), ["Educational only.", "No invented news."]);
  }

  assert.equal(articleListCacheKey(origin, "all", "", ""), `ipo-singh.articles.${encodeURIComponent(origin)}.all..`);
  assert.equal(articleDetailCacheKey(origin, summary.slug).includes(summary.slug), true);
});
