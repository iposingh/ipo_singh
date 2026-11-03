import type { Metadata } from "next";
import { Suspense } from "react";
import { JsonLd } from "@/components/seo/json-ld";
import { PageContainer } from "@/components/layout/page-container";
import { LoadingState } from "@/components/ui/loading-state";
import { CompareView } from "@/features/compare/compare-view";
import type { CompareColumn } from "@/features/compare/rows";
import { compareSlugKey, parseCompareSelection } from "@/features/compare/selection";
import { loadCompareIpos, searchCompareCandidates } from "@/features/ipos/catalog";
import { compareIsIndexable } from "@/lib/seo/indexing";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteUrl } from "@/lib/seo/site";
import { webPageDocument } from "@/lib/seo/structured-data";

const description =
  "Compare two to four stored IPO issues side by side. GMP is unofficial and does not guarantee listing returns. This page does not rank or recommend an issue.";

type CompareParams = Promise<{
  ipo?: string | string[];
  q?: string | string[];
}>;

export async function generateMetadata({ searchParams }: { searchParams: CompareParams }): Promise<Metadata> {
  const selection = parseCompareSelection(await searchParams);
  const index = compareIsIndexable(selection);
  if (!index && selection.slugs.length >= 2) {
    const loaded = await loadCompareIpos(compareSlugKey(selection.slugs));
    if (loaded.status === "ready") {
      const names = loaded.ipos.flatMap((ipo) => (ipo ? [ipo.companyName] : []));
      if (names.length >= 2) {
        return pageMetadata({ title: `Compare ${names.join(", ")}`, description, path: "/compare", index: false });
      }
    }
  }
  return pageMetadata({ title: "Compare IPOs", description, path: "/compare", index });
}

export default function ComparePage({ searchParams }: { searchParams: CompareParams }) {
  return (
    <Suspense
      fallback={
        <PageContainer className="grid gap-6">
          <LoadingState label="Loading comparison" />
        </PageContainer>
      }
    >
      <CompareContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CompareContent({ searchParams }: { searchParams: CompareParams }) {
  const selection = parseCompareSelection(await searchParams);
  const [loaded, found] = await Promise.all([
    selection.slugs.length > 0 ? loadCompareIpos(compareSlugKey(selection.slugs)) : Promise.resolve({ status: "ready" as const, ipos: [] }),
    selection.q ? searchCompareCandidates(selection.q) : Promise.resolve({ status: "idle" as const }),
  ]);
  const columns: CompareColumn[] =
    loaded.status === "ready"
      ? selection.slugs.map((slug, index) => {
          const ipo = loaded.ipos[index];
          return ipo ? { state: "stored", ipo } : { state: "missing", slug };
        })
      : [];
  const search = found.status === "idle" ? "idle" : found.status === "short" ? "short" : found.status === "unavailable" ? "unavailable" : "ready";
  const origin = siteUrl();
  return (
    <>
      {origin && compareIsIndexable(selection) ? (
        <JsonLd data={webPageDocument(origin, { name: "Compare IPOs", path: "/compare", description })} />
      ) : null}
      <CompareView
      selection={selection}
      columns={columns}
      matches={found.status === "ready" ? found.items : []}
      search={search}
      truncated={found.status === "ready" ? found.truncated : false}
      unavailable={loaded.status === "unavailable"}
    />
    </>
  );
}
