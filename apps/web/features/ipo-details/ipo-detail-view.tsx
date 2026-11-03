import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageContainer } from "@/components/layout/page-container";
import { AllotmentSection } from "@/features/ipo-details/allotment-section";
import { AnchorsSection } from "@/features/ipo-details/anchors-section";
import { IpoDetailNav } from "@/features/ipo-details/detail-nav";
import { DocumentsSection } from "@/features/ipo-details/documents-section";
import { FinancialsSection } from "@/features/ipo-details/financials-section";
import { GmpSection } from "@/features/ipo-details/gmp-section";
import { IpoDetailHeader } from "@/features/ipo-details/ipo-detail-header";
import { ListingSection } from "@/features/ipo-details/listing-section";
import { OverviewSection } from "@/features/ipo-details/overview-section";
import { SubscriptionSection } from "@/features/ipo-details/subscription-section";
import { TimelineSection } from "@/features/ipo-details/timeline-section";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { SourceAttribution } from "@/features/ipo-details/source-attribution";
import type { IpoDetailModel } from "@/features/ipos/catalog";
import { boardBrowseTitle } from "@/features/ipos/labels";

const sectionClass = "grid scroll-mt-40 gap-10 outline-none lg:scroll-mt-52";

export function IpoDetailView({ detail }: { detail: IpoDetailModel | null }) {
  const ipo = detail?.ipo ?? null;
  const boardHref = ipo ? `/ipos/${ipo.board}` : "/ipos/mainboard";
  const boardTitle = ipo ? boardBrowseTitle(ipo.board) : "Mainboard IPOs";
  return (
    <PageContainer className="grid gap-8">
      <Breadcrumbs
        items={[
          { href: "/", label: "Home" },
          { href: boardHref, label: boardTitle },
          { label: ipo?.companyName ?? "IPO" },
        ]}
      />
      <IpoDetailHeader ipo={ipo} />
      <IpoDetailNav />
      <DetailAnchor id="overview">
        <OverviewSection ipo={ipo} />
        <TimelineSection ipo={ipo} />
      </DetailAnchor>
      <DetailAnchor id="gmp">
        <GmpSection
          ipo={ipo}
          history={detail?.gmpHistory ?? []}
          sourceName={detail?.gmpSourceName ?? null}
          historyRetrievedAt={detail?.gmpHistoryRetrievedAt ?? null}
          historyWindow={detail?.gmpHistoryWindow ?? null}
          historyStatus={detail?.gmpHistoryStatus ?? "ready"}
        />
      </DetailAnchor>
      <DetailAnchor id="subscription">
        <SubscriptionSection
          ipo={ipo}
          history={detail?.subscriptionHistory ?? []}
          sourceName={detail?.subscriptionSourceName ?? null}
          historyRetrievedAt={detail?.subscriptionHistoryRetrievedAt ?? null}
          historyStatus={detail?.subscriptionHistoryStatus ?? "ready"}
        />
      </DetailAnchor>
      <DetailAnchor id="financials">
        <FinancialsSection ipo={ipo} />
        <AnchorsSection ipo={ipo} />
      </DetailAnchor>
      <DetailAnchor id="allotment">
        <AllotmentSection ipo={ipo} />
      </DetailAnchor>
      <DetailAnchor id="listing">
        <ListingSection ipo={ipo} />
      </DetailAnchor>
      <DetailAnchor id="documents">
        <DocumentsSection ipo={ipo} />
      </DetailAnchor>
      {ipo && isIpoGuruSource(ipo.provenance.sourceName) ? <SourceAttribution retrievedAt={ipo.provenance.retrievedAt} sourceName={ipo.provenance.sourceName} /> : null}
    </PageContainer>
  );
}

function DetailAnchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} tabIndex={-1} className={sectionClass}>
      {children}
    </div>
  );
}
