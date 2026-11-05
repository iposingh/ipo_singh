import type { Ipo, SubscriptionSnapshot } from "@ipo-singh/contracts";
import { brandColors, darkColors, lightColors } from "@ipo-singh/design-tokens";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BrandMark } from "@/components/brand/brand-mark";
import { GmpDisplay } from "@/components/financial/gmp-display";
import { IstDateTime, LastUpdated } from "@/components/financial/ist-date-time";
import { MissingValue } from "@/components/financial/missing-value";
import { PriceBand } from "@/components/financial/price-band";
import { SignedChange } from "@/components/financial/signed-change";
import { SubscriptionMultiple } from "@/components/financial/subscription-multiple";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataFreshnessBadge } from "@/components/ui/data-freshness-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Table, type TableColumn } from "@/components/ui/table";
import { DesignSystemControls } from "@/features/design-system/design-system-controls";
import { dailyMaxGapMs, intradayMaxGapMs, type GmpChartPoint } from "@/features/ipo-details/gmp-chart";
import { GmpHistoryChart } from "@/features/ipo-details/gmp-history-chart";
import { AllotmentSection } from "@/features/ipo-details/allotment-section";
import { DocumentsSection } from "@/features/ipo-details/documents-section";
import { FinancialsSection } from "@/features/ipo-details/financials-section";
import { ListingSection } from "@/features/ipo-details/listing-section";
import { OverviewSection } from "@/features/ipo-details/overview-section";
import { SubscriptionSection } from "@/features/ipo-details/subscription-section";
import { TimelineSection } from "@/features/ipo-details/timeline-section";
import { subscriptionChartPoints, subscriptionDayGapMs } from "@/features/ipo-details/subscription-chart";
import { SubscriptionHistoryChart } from "@/features/ipo-details/subscription-history-chart";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const sampleNow = new Date("2026-10-18T06:00:00.000Z");
const sampleFresh = new Date("2026-10-18T05:50:00.000Z");
const sampleStale = new Date("2026-10-17T06:00:00.000Z");

type SampleRow = {
  id: string;
  name: string;
  gmpAmount: number | null;
  gmpPercent: number | null;
  subscription: number | null;
  low: number | null;
  high: number | null;
};

const sampleWindow = {
  high: { amountRupees: 39.5, observedOn: "2026-08-31" },
  low: { amountRupees: 0, observedOn: "2026-08-29" },
  truncated: true,
  timelineLocked: false,
};

const sampleDaily: GmpChartPoint[] = [
  { at: Date.parse("2026-08-28T18:30:00.000Z"), amountRupees: 0, percent: 0, axisLabel: "29 Aug 2026", tickLabel: "29 Aug", tooltip: "29 Aug 2026 · ₹0 · 0.00% · Low", high: false, low: true },
  { at: Date.parse("2026-08-30T18:30:00.000Z"), amountRupees: 39.5, percent: 28.62, axisLabel: "31 Aug 2026", tickLabel: "31 Aug", tooltip: "31 Aug 2026 · ₹39.50 · +28.62% · High", high: true, low: false },
  { at: Date.parse("2026-09-01T18:30:00.000Z"), amountRupees: -15, percent: -10.87, axisLabel: "2 Sep 2026", tickLabel: "2 Sep", tooltip: "2 Sep 2026 · −₹15.00 · −10.87%", high: false, low: false },
];

const sampleIntraday: GmpChartPoint[] = [
  { at: Date.parse("2026-08-31T05:18:02.000Z"), amountRupees: 32, percent: 23.19, axisLabel: "31 Aug 2026, 10:48 AM IST", tickLabel: "11 AM", tooltip: "31 Aug 2026, 10:48 AM IST · 11 AM · ₹32 · +23.19%", high: false, low: false },
  { at: Date.parse("2026-08-31T11:30:00.000Z"), amountRupees: 36, percent: 26.09, axisLabel: "31 Aug 2026, 5:00 PM IST", tickLabel: "5 PM", tooltip: "31 Aug 2026, 5:00 PM IST · 5 PM · ₹36 · +26.09%", high: false, low: false },
  { at: Date.parse("2026-09-02T11:31:00.000Z"), amountRupees: -15, percent: -10.87, axisLabel: "2 Sep 2026, 5:01 PM IST", tickLabel: "5:01 PM", tooltip: "2 Sep 2026, 5:01 PM IST · −₹15.00 · −10.87%", high: false, low: false },
];

const sampleSubscriptionNow = new Date("2026-09-01T14:00:00.000Z");

const sampleSubscriptionHistory: SubscriptionSnapshot[] = [
  {
    retailTimes: 0.2,
    qibTimes: 0.4,
    niiTimes: 0.2,
    employeeTimes: 0,
    shareholderTimes: null,
    anchorTimes: null,
    totalTimes: 0.8,
    observedAt: "2026-08-24T14:00:41.000Z",
    observedOn: "2026-08-24",
    biddingDay: 1,
    freshness: "fresh",
  },
  {
    retailTimes: 0,
    qibTimes: 0,
    niiTimes: 0,
    employeeTimes: 0,
    shareholderTimes: 0,
    totalTimes: 0,
    observedAt: "2026-08-25T14:00:00.000Z",
    observedOn: "2026-08-25",
    biddingDay: 2,
    freshness: "fresh",
  },
  {
    retailTimes: 6.2,
    qibTimes: 4,
    niiTimes: 2.1,
    employeeTimes: 0,
    shareholderTimes: 0.2,
    totalTimes: 12.5,
    observedAt: null,
    observedOn: "2026-08-28",
    biddingDay: 4,
    freshness: "fresh",
  },
];

const sampleIpo: Ipo = {
  id: "sample-forge",
  slug: "sample-forge",
  companyName: "Sample Forge Ltd",
  board: "mainboard",
  status: "open",
  offer: {
    priceBand: { lowRupees: 100, highRupees: 120 },
    issuePriceRupees: null,
    issueSizeRupees: null,
    lotSizeShares: null,
    minimumInvestmentRupees: null,
  },
  dates: { openDate: "2026-08-24", closeDate: "2026-08-28", allotmentDate: null, listingDate: null },
  gmp: null,
  subscription: {
    retailTimes: 0.8,
    qibTimes: 8.25,
    niiTimes: 4,
    employeeTimes: 0,
    shareholderTimes: 0,
    anchorTimes: null,
    categories: [
      { key: "RETAIL", times: 0.8, subcategories: [] },
      { key: "QIB", times: 8.25, subcategories: [{ key: "FII", times: null }] },
      {
        key: "NII",
        times: 4,
        subcategories: [
          { key: "BNII", times: 3 },
          { key: "SNII", times: 1 },
        ],
      },
      { key: "EMPLOYEE", times: 0, subcategories: [] },
      { key: "SHAREHOLDER", times: 0, subcategories: [] },
      { key: "ANCHOR", times: null, subcategories: [] },
    ],
    totalTimes: 12.5,
    observedAt: "2026-09-01T13:01:00.000Z",
    observedOn: "2026-09-01",
    biddingDay: null,
    freshness: "fresh",
  },
  financials: [],
  registrar: null,
  documents: [],
  listing: null,
  provenance: { sourceName: "IPO Guru Pro", retrievedAt: "2026-09-01T13:05:00.000Z", freshness: "fresh" },
};

const sampleDetail: Ipo = {
  id: "sample-detail",
  slug: "sample-detail",
  companyName: "Sample Detail Ltd",
  board: "mainboard",
  status: "listed",
  offer: {
    priceBand: { lowRupees: 131, highRupees: 138 },
    issuePriceRupees: 138,
    issueSizeRupees: 5_828_000_000,
    lotSizeShares: 100,
    minimumInvestmentRupees: 13800,
  },
  dates: {
    openDate: "2026-08-24",
    closeDate: "2026-08-27",
    allotmentDate: "2026-08-28",
    listingDate: "2026-09-01",
  },
  gmp: null,
  subscription: null,
  financials: [],
  registrar: {
    name: "Bigshare Services Private Limited",
    websiteUrl: "https://www.bigshareonline.com/",
    allotmentUrl: "https://ipo.bigshareonline.com/ipo_status.html",
  },
  documents: [{ kind: "rhp", title: "Red herring prospectus", url: "https://example.com/sample-rhp.pdf", publishedOn: null }],
  listing: { issuePriceRupees: 138, listingPriceRupees: 124, gainPercent: -10.14, listedOn: "2026-09-01" },
  profile: {
    refundDate: "2026-08-31",
    dematCreditDate: "2026-08-31",
    about: "Illustrative company overview for the detail layout. This is not a live issue.",
    description: null,
    strengths: ["Sample strength published as prose."],
    risks: ["Sample risk published as prose."],
    promoters: [{ name: "Sample Promoter", profile: "Founder" }],
    objectsOfIssue: { items: ["Repayment of sample borrowings"], text: null },
    sourceFinancials: {
      unit: "Rs. Crore",
      headers: ["31 Mar 2026", "31 Mar 2025", "31 Mar 2024"],
      rows: [{ metric: "Assets", values: ["1,508.24", "1,321.64", null] }],
      text: null,
    },
    cmpRupees: 126.46,
    currentGainPercent: -8.36,
  },
  provenance: { sourceName: "Sample layout", retrievedAt: "2026-09-02T04:00:00.000Z", freshness: "fresh" },
};

const sampleSme: Ipo = {
  ...sampleDetail,
  id: "sample-sme",
  slug: "sample-sme",
  companyName: "Sample SME Ltd",
  board: "sme",
  status: "closed",
  listing: null,
  documents: [],
  registrar: { name: "Sample Registrar", websiteUrl: "https://registrar.example/", allotmentUrl: "https://registrar.example/allotment" },
  profile: {
    ...sampleDetail.profile!,
    sourceFinancials: {
      unit: null,
      headers: [],
      rows: [],
      text: "Revenue rose during the reported years. These words are the source statement.",
    },
    cmpRupees: null,
    currentGainPercent: null,
  },
};

const sampleRows: SampleRow[] = [
  { id: "sample-forge", name: "Sample Forge Ltd", gmpAmount: 125, gmpPercent: 18.52, subscription: 24.6, low: 650, high: 675 },
  { id: "sample-paper", name: "Sample Paper Co", gmpAmount: 0, gmpPercent: 0, subscription: 0, low: 100, high: 105 },
  { id: "sample-missing", name: "Sample Missing Data", gmpAmount: null, gmpPercent: null, subscription: null, low: null, high: null },
];

const columns: TableColumn<SampleRow>[] = [
  { id: "name", header: "Sample issue", cell: (row) => row.name },
  { id: "gmp", header: "GMP", cell: (row) => <GmpDisplay amountRupees={row.gmpAmount} percent={row.gmpPercent} /> },
  { id: "subscription", header: "Subscription", numeric: true, cell: (row) => <SubscriptionMultiple value={row.subscription} /> },
  { id: "band", header: "Price band", numeric: true, cell: (row) => <PriceBand lowRupees={row.low} highRupees={row.high} /> },
];

const swatches = [
  ["Primary green", brandColors.primaryGreen],
  ["Bright green", brandColors.brightGreen],
  ["Accent lime", brandColors.accentLime],
  ["Deep green", brandColors.deepGreen],
  ["Soft green", brandColors.softGreen],
  ["Main text", brandColors.mainText],
  ["Background", brandColors.background],
  ["Card", brandColors.cardSurface],
  ["Muted text", brandColors.mutedText],
  ["Negative", brandColors.negativeData],
  ["Warning", brandColors.warning],
  ["Information", brandColors.information],
  ["Dark background", brandColors.darkBackground],
  ["Dark card", brandColors.darkCardSurface],
  ["Dark text", brandColors.darkMainText],
  ["Dark border", brandColors.darkBorder],
] as const;

export function DesignSystemView() {
  return (
    <div className="mx-auto grid w-full max-w-[70rem] gap-14 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-4">
          <BrandLogo priority />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Growth Arrow Green
          </h1>
        </div>
        <ThemeToggle />
      </header>

      <p className="rounded-panel border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground">
        Illustrative sample data. These figures are not live IPO market data.
      </p>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Brand"
          title="Approved artwork"
          description="The horizontal lockup, light app icon, dark app icon, and icon-only mark are cropped from the approved sheet. In dark mode the lockup stays on white so the navy and green wordmark is not recolored. The sheet icons are about 310 pixels square, so the 512 pixel icon is that same artwork at a larger size."
        />
        <Card className="flex items-center justify-center">
          <BrandLogo />
        </Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <figure className="grid justify-items-center gap-3 rounded-panel border border-border bg-white p-4">
            <BrandMark variant="light" size={96} />
            <figcaption className="text-center text-sm" style={{ color: brandColors.mainText }}>
              App icon, light
            </figcaption>
          </figure>
          <figure
            className="grid justify-items-center gap-3 rounded-panel border border-border p-4"
            style={{ backgroundColor: brandColors.darkBackground }}
          >
            <BrandMark variant="dark" size={96} />
            <figcaption className="text-center text-sm" style={{ color: brandColors.darkMainText }}>
              App icon, dark
            </figcaption>
          </figure>
          <figure className="grid justify-items-center gap-3 rounded-panel border border-border bg-surface p-4">
            <BrandMark variant="only" size={96} />
            <figcaption className="text-center text-sm text-foreground">Icon only</figcaption>
          </figure>
        </div>
        <div className="flex items-end gap-6 overflow-x-auto pb-2">
          {[32, 48, 192, 512].map((size) => (
            <figure key={size} className="grid shrink-0 justify-items-center gap-2">
              <BrandMark size={size} />
              <figcaption className="font-mono text-xs text-muted">{size}px</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Color"
          title="Approved palette"
          description="Light and dark semantic tokens switch with the theme control. Light filled controls use strong emerald; dark CTAs use lime with near-black labels for contrast."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {swatches.map(([name, hex]) => (
            <Card key={name} className="p-3">
              <span className="block h-12 rounded-control border border-border" style={{ backgroundColor: hex }} />
              <span className="mt-3 block text-sm font-medium text-foreground">{name}</span>
              <span className="mt-1 block font-mono text-xs text-muted">{hex}</span>
            </Card>
          ))}
        </div>
        <p className="text-sm text-muted">
          Light button fill {lightColors.primarySolid}. Dark button fill {darkColors.primarySolid}.
        </p>
      </section>

      <section className="grid gap-6">
        <SectionHeader eyebrow="Type" title="Typography" description="Geist for interface text, with a clear size ladder." />
        <Card className="grid gap-4">
          <p className="text-4xl font-semibold tracking-tight">IPO Singh</p>
          <p className="text-3xl font-semibold tracking-tight">Section title</p>
          <p className="text-lg">Supporting line for a financial summary.</p>
          <p className="text-base leading-7">Body copy stays at 16px so prices, dates, and explanations remain readable on a phone.</p>
          <p className="font-mono text-sm text-muted">₹125 · 24.6x · 18 Oct 2026</p>
        </Card>
      </section>

      <section className="grid gap-6">
        <SectionHeader eyebrow="Controls" title="Buttons, fields, and overlays" />
        <DesignSystemControls />
      </section>

      <section className="grid gap-6">
        <SectionHeader eyebrow="Status" title="Badges and freshness" description="Status is written in words. Color and arrows repeat the same meaning." />
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="positive">Gain</Badge>
          <Badge tone="negative">Loss</Badge>
          <Badge tone="warning">Review</Badge>
        </div>
        <Card className="grid gap-3">
          <DataFreshnessBadge updatedAt={sampleFresh} now={sampleNow} />
          <DataFreshnessBadge updatedAt={sampleStale} now={sampleNow} />
          <DataFreshnessBadge updatedAt={null} now={sampleNow} />
        </Card>
      </section>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Figures"
          title="Financial presentation"
          description="Zero stays zero. A missing quote is Unavailable. Sample figures only."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="GMP" value={<GmpDisplay amountRupees={125} percent={18.52} />} hint="Sample gain" />
          <StatCard label="GMP at zero" value={<GmpDisplay amountRupees={0} percent={0} />} hint="Sample flat value" />
          <StatCard label="GMP missing" value={<GmpDisplay amountRupees={null} percent={null} />} hint="Sample gap" />
          <StatCard label="Subscription" value={<SubscriptionMultiple value={24.6} />} />
          <StatCard label="Subscription at zero" value={<SubscriptionMultiple value={0} />} />
          <StatCard label="Price band" value={<PriceBand lowRupees={650} highRupees={675} />} />
        </div>
        <Card className="grid gap-3 text-sm">
          <p>
            Signed change: <SignedChange percent={18.52} /> <SignedChange percent={-4.5} /> <SignedChange percent={0} />
          </p>
          <p>
            Missing value: <MissingValue />
          </p>
          <p>
            Timestamp: <IstDateTime value={sampleNow} />
          </p>
          <LastUpdated value={sampleNow} />
          <LastUpdated value={null} />
        </Card>
        <Table caption="Illustrative sample issues, not live market data" columns={columns} rows={sampleRows} getRowKey={(row) => row.id} />
      </section>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Sample chart"
          title="GMP history"
          description="Sample points for the chart, not a live issue. The missing day between 29 Aug and 31 Aug is not connected. Grey market premium is unofficial and indicative."
        />
        <GmpHistoryChart title="Daily GMP (₹)" points={sampleDaily} maxGapMs={dailyMaxGapMs} window={sampleWindow} emptyDescription="No sample daily points." />
        <GmpHistoryChart title="Intraday GMP (₹)" points={sampleIntraday} maxGapMs={intradayMaxGapMs} window={sampleWindow} emptyDescription="No sample intraday points." />
        <GmpHistoryChart title="Daily GMP (₹)" points={[]} maxGapMs={dailyMaxGapMs} status="loading" emptyDescription="No sample daily points." />
        <GmpHistoryChart title="Daily GMP (₹)" points={[]} maxGapMs={dailyMaxGapMs} emptyDescription="No daily GMP history is loaded. Missing days are left blank and are not plotted as zero." />
        <GmpHistoryChart title="Intraday GMP (₹)" points={[]} maxGapMs={intradayMaxGapMs} status="unavailable" emptyDescription="No sample intraday points." />
      </section>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Sample subscription"
          title="Subscription breakdown"
          description="Sample multiples for the detail layout, not a live issue. 12.5x, 0.8x, and 0x are published figures in this sample. The missing day is not connected."
        />
        <SubscriptionSection ipo={sampleIpo} history={sampleSubscriptionHistory} sourceName="IPO Guru Pro" historyRetrievedAt="2026-09-01T13:05:00.000Z" now={sampleSubscriptionNow} />
        <SubscriptionHistoryChart
          title="Day-wise subscription"
          points={[]}
          maxGapMs={subscriptionDayGapMs}
          status="unavailable"
          emptyDescription="No day-wise subscription history is loaded."
        />
        <SubscriptionHistoryChart
          title="Day-wise subscription"
          points={subscriptionChartPoints([])}
          maxGapMs={subscriptionDayGapMs}
          emptyDescription="No day-wise subscription history is loaded. Missing days are left blank and are not plotted as zero."
        />
      </section>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Sample IPO detail"
          title="Mainboard detail"
          description="Illustrative Mainboard layout. Assets stay labeled Assets, in Rs. Crore. The allotment button uses the sample Bigshare page."
        />
        <OverviewSection ipo={sampleDetail} />
        <TimelineSection ipo={sampleDetail} />
        <FinancialsSection ipo={sampleDetail} />
        <DocumentsSection ipo={sampleDetail} />
        <AllotmentSection ipo={sampleDetail} />
        <ListingSection ipo={sampleDetail} />
      </section>

      <section className="grid gap-6">
        <SectionHeader
          eyebrow="Sample SME"
          title="Prose financials and an unverified registrar"
          description="Illustrative SME layout. The financial statement is prose, and Check Allotment stays off because the registrar page is not an official host."
        />
        <OverviewSection ipo={sampleSme} />
        <FinancialsSection ipo={sampleSme} />
        <AllotmentSection ipo={sampleSme} />
        <FinancialsSection ipo={null} />
      </section>

      <section className="grid gap-6">
        <SectionHeader eyebrow="Feedback" title="Loading, empty, and error" />
        <Card className="grid gap-3" aria-hidden>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
        <p className="sr-only">Loading placeholders shown above.</p>
        <LoadingState label="Loading sample issues" />
        <EmptyState title="No sample issues" description="This empty state is a preview. It is not the result of a market search." />
        <ErrorState title="Sample data could not be shown" message="This error state is illustrative. No request was made." />
      </section>
    </div>
  );
}
