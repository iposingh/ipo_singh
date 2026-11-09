import type { ArticleRecord } from "./records.ts";

/**
 * Educational evergreen articles only.
 * Do not invent market news, scrape third-party articles, or republish copyrighted copy.
 */
export function seedArticleRecords(now = new Date("2026-10-20T04:30:00.000Z")): ArticleRecord[] {
  const updated = now;
  return [
    {
      id: "what-is-gmp",
      slug: "what-is-grey-market-premium",
      title: "What is Grey Market Premium (GMP)?",
      summary: "An educational overview of unofficial grey-market premiums and why they are not exchange prices.",
      category: "gmp-updates",
      status: "published",
      authorName: "IPO Singh Editorial",
      sourceName: "IPO Singh",
      publishedAt: now,
      createdAt: now,
      updatedAt: updated,
      evergreen: true,
      relatedIpoSlugs: [],
      citations: [{ label: "NSE — Investor awareness", url: "https://www.nseindia.com/" }],
      cover: null,
      bodyMarkdown: `Grey Market Premium (GMP) is an unofficial indication discussed among market participants before listing.

GMP is not published by NSE or BSE. It can change quickly and may not reflect the eventual listing price.

IPO Singh labels GMP with an asterisk and shows source timestamps so delayed readings are not presented as live quotes.

This article does not recommend any IPO.`,
    },
    {
      id: "how-allotment-works",
      slug: "how-ipo-allotment-status-works",
      title: "How IPO allotment status works",
      summary: "A short guide to registrar allotment portals and why a scheduled allotment date is not proof that results are out.",
      category: "allotment-updates",
      status: "published",
      authorName: "IPO Singh Editorial",
      sourceName: "IPO Singh",
      publishedAt: new Date("2026-10-20T04:35:00.000Z"),
      createdAt: new Date("2026-10-20T04:35:00.000Z"),
      updatedAt: new Date("2026-10-20T04:35:00.000Z"),
      evergreen: true,
      relatedIpoSlugs: [],
      citations: [],
      cover: null,
      bodyMarkdown: `Allotment results are published by the issue registrar after the allotment process completes.

A scheduled allotment date on a calendar is an expectation, not confirmation.

IPO Singh enables Check Allotment only for verified registrar portals and does not collect PAN, application numbers, or DP IDs.

Always confirm status on the official registrar site.`,
    },
  ];
}
