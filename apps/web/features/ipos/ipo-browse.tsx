import type { Metadata } from "next";
import { Suspense } from "react";
import type { Board, IpoStatus } from "@ipo-singh/contracts";
import { PageContainer } from "@/components/layout/page-container";
import { JsonLd } from "@/components/seo/json-ld";
import { LoadingState } from "@/components/ui/loading-state";
import { defaultBrowseQuery, parseBrowseQuery, type IpoBrowseQuery, type IpoStatusFilter } from "@/features/ipos/browse";
import { loadListingPage } from "@/features/ipos/catalog";
import { IpoBrowseView } from "@/features/ipos/ipo-browse-view";
import { isListingOverview, listingSections, parseListingPage, sectionPreviewLimit, type ListingSectionPage } from "@/features/ipos/listing-sections";
import { listingPageLimit, type ListingPageResult } from "@/lib/api/ipo-singh";
import { browseIsIndexable, listingPageFromParams } from "@/lib/seo/indexing";
import { pageMetadata } from "@/lib/seo/metadata";
import { istCalendarDate } from "@ipo-singh/core";
import { siteUrl } from "@/lib/seo/site";
import { collectionDocument, type LinkedItem } from "@/lib/seo/structured-data";

type BrowseParams = Promise<{
  q?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
}>;

export async function IpoBrowse({ board, searchParams }: { board: Board; searchParams: BrowseParams }) {
  const params = await searchParams;
  const query = parseBrowseQuery(params);
  const page = parseListingPage(params.page);
  const overview = isListingOverview(query);
  const sections = overview ? await loadOverview(board, query.q) : [];
  const list = overview ? null : await loadFilteredPage(board, query, page);
  const meta = browseMetadata(board);
  const description = typeof meta.description === "string" ? meta.description : "";
  const origin = siteUrl();
  const now = new Date();
  const today = istCalendarDate(now) ?? "";
  const graph =
    origin && browseIsIndexable(query, page)
      ? collectionDocument(origin, {
          name: board === "mainboard" ? "Mainboard IPOs" : "SME IPOs",
          path: `/ipos/${board}`,
          description,
          items: previewLinks(sections),
        })
      : null;
  return (
    <>
      <JsonLd data={graph} />
      <IpoBrowseView board={board} query={query} page={page} sections={sections} list={list} today={today} now={now.toISOString()} />
    </>
  );
}

export function IpoBrowsePage({ board, searchParams }: { board: Board; searchParams: BrowseParams }) {
  return (
    <Suspense
      fallback={
        <PageContainer className="grid gap-6">
          <LoadingState label={`Loading ${board === "mainboard" ? "Mainboard" : "SME"} IPOs`} />
        </PageContainer>
      }
    >
      <IpoBrowse board={board} searchParams={searchParams} />
    </Suspense>
  );
}

export function browseMetadata(
  board: Board,
  params?: {
    q?: string | string[];
    status?: string | string[];
    sort?: string | string[];
    direction?: string | string[];
    page?: string | string[];
  },
): Metadata {
  const title = board === "mainboard" ? "Mainboard IPOs" : "SME IPOs";
  const description =
    board === "mainboard"
      ? "Mainboard IPO issues stored by IPO Singh, separate from SME. The list stays empty when none are stored."
      : "SME IPO issues stored by IPO Singh, kept separate from Mainboard. The list stays empty when none are stored.";
  const query = params ? parseBrowseQuery(params) : defaultBrowseQuery;
  const page = params ? listingPageFromParams(params.page) : 1;
  return pageMetadata({
    title,
    description,
    path: `/ipos/${board}`,
    index: browseIsIndexable(query, page),
  });
}

async function loadOverview(board: Board, q: string): Promise<ListingSectionPage[]> {
  return Promise.all(
    listingSections(board).map(async (section) => {
      const loaded = await loadListingPage({
        board,
        status: section.query.status === "all" ? undefined : apiStatus(section.query.status),
        q: q || undefined,
        sort: section.query.sort,
        direction: section.query.direction,
        page: 1,
        limit: sectionPreviewLimit,
      });
      return { section, status: loaded.status, items: loaded.items, totalCount: loaded.totalCount };
    }),
  );
}

function loadFilteredPage(board: Board, query: IpoBrowseQuery, page: number): Promise<ListingPageResult> {
  return loadListingPage({
    board,
    status: query.status === "all" ? undefined : apiStatus(query.status),
    q: query.q || undefined,
    sort: query.sort,
    direction: query.direction,
    page,
    limit: listingPageLimit,
  });
}

function apiStatus(status: IpoStatusFilter): IpoStatus | undefined {
  if (status === "all") return undefined;
  return status;
}

function previewLinks(sections: readonly ListingSectionPage[]): LinkedItem[] {
  const seen = new Set<string>();
  const links: LinkedItem[] = [];
  for (const section of sections) {
    for (const ipo of section.items) {
      if (seen.has(ipo.slug)) continue;
      seen.add(ipo.slug);
      links.push({ name: ipo.companyName, path: `/ipos/${ipo.slug}` });
    }
  }
  return links;
}
