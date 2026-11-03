import type { Metadata } from "next";
import { Suspense } from "react";
import { JsonLd } from "@/components/seo/json-ld";
import { PageContainer } from "@/components/layout/page-container";
import { LoadingState } from "@/components/ui/loading-state";
import { loadListedIpos } from "@/features/ipos/catalog";
import { arrangeListed, parseListedQuery } from "@/features/ipos/listed";
import { ListedView } from "@/features/ipos/listed-view";
import { listedIsIndexable } from "@/lib/seo/indexing";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteUrl } from "@/lib/seo/site";
import { webPageDocument } from "@/lib/seo/structured-data";

type ListedParams = Promise<{
  q?: string | string[];
  board?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
}>;

const description =
  "Actual listing prices and listing gains for issues stored by IPO Singh. Grey market premium is not shown as a listing gain.";

export async function generateMetadata({ searchParams }: { searchParams: ListedParams }): Promise<Metadata> {
  const query = parseListedQuery(await searchParams);
  return pageMetadata({
    title: "Listed IPOs",
    description,
    path: "/ipos/listed",
    index: listedIsIndexable(query),
  });
}

export default function ListedIposPage({ searchParams }: { searchParams: ListedParams }) {
  return (
    <Suspense
      fallback={
        <PageContainer className="grid gap-6">
          <LoadingState label="Loading listed IPOs" />
        </PageContainer>
      }
    >
      <ListedContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ListedContent({ searchParams }: { searchParams: ListedParams }) {
  const query = parseListedQuery(await searchParams);
  const loaded = await loadListedIpos();
  const items = loaded.status === "ready" ? arrangeListed(loaded.ipos, query) : [];
  const origin = siteUrl();
  return (
    <>
      {origin && listedIsIndexable(query) ? (
        <JsonLd data={webPageDocument(origin, { name: "Listed IPOs", path: "/ipos/listed", description })} />
      ) : null}
      <ListedView
        query={query}
        items={items}
        truncated={loaded.status === "ready" ? loaded.truncated : false}
        unavailable={loaded.status === "unavailable"}
      />
    </>
  );
}
