import { useRef, useState, type ComponentRef } from "react";
import type { Ipo } from "@ipo-singh/contracts";
import { Linking, Pressable, ScrollView, Share, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { readAppEnvironment } from "../api/origin";
import type { ChartPhase, GmpHistoryDocument, SubscriptionHistoryDocument } from "../catalogue/history";
import { allotmentLink, documentLink, publicIpoPage } from "../detail/links";
import {
  allotmentModel,
  anchorModel,
  documentModel,
  financialModel,
  gmpModel,
  listingModel,
  overviewModel,
  profileModel,
  subscriptionModel,
} from "../detail/model";
import { detailSections, type DetailSectionId } from "../detail/sections";
import { boardLabel } from "../design/copy";
import { summaryFromDetail } from "../watchlist/list";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppCard } from "./app-card";
import { AppText } from "./app-text";
import { CompareToggle } from "./discovery-controls";
import { DataFreshnessLabel } from "./data-freshness-label";
import { EmptyState } from "./empty-state";
import { GmpHistoryPanels, SubscriptionHistoryPanels } from "./history-charts";
import { JourneyTimeline } from "./journey-timeline";
import { PrimaryButton } from "./primary-button";
import { ScreenContainer } from "./screen-container";
import { SectionHeader } from "./section-header";
import { SourceAttribution } from "./source-attribution";
import { StatusBadge } from "./status-badge";
import { WatchSaveButton } from "./watch-save-button";

function FactLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: mobileTheme.spacing[1] }}>
      <AppText size="sm" tone="muted">
        {label}
      </AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

function FactCard({ title, facts, footer }: { title?: string; facts: readonly { label: string; value: string }[]; footer?: string | null }) {
  return (
    <AppCard>
      {title ? <AppText weight="semibold">{title}</AppText> : null}
      {facts.map((fact) => (
        <FactLine key={fact.label} label={fact.label} value={fact.value} />
      ))}
      {footer ? (
        <AppText size="sm" tone="muted">
          {footer}
        </AppText>
      ) : null}
    </AppCard>
  );
}

function NarrativeList({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <AppCard>
      <AppText weight="semibold">{title}</AppText>
      {items.map((item) => (
        <AppText key={item} size="sm" style={{ lineHeight: 22 }}>
          {item}
        </AppText>
      ))}
    </AppCard>
  );
}

export function IpoDetailView({
  ipo,
  notice,
  refreshing,
  onRefresh,
  gmpHistory,
  subscriptionHistory,
}: {
  ipo: Ipo;
  notice: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  gmpHistory: ChartPhase<GmpHistoryDocument>;
  subscriptionHistory: ChartPhase<SubscriptionHistoryDocument>;
}) {
  const { palette } = useTheme();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Partial<Record<DetailSectionId, number>>>({});
  const activeRef = useRef<DetailSectionId>("overview");
  const [active, setActive] = useState<DetailSectionId>("overview");
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const page = publicIpoPage(process.env.EXPO_PUBLIC_IPO_SINGH_SITE_URL, ipo.slug, readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__));
  const savedSummary = summaryFromDetail(ipo);
  const overview = overviewModel(ipo);
  const profile = profileModel(ipo);
  const gmp = gmpModel(ipo);
  const subscription = subscriptionModel(ipo);
  const financials = financialModel(ipo);
  const anchors = anchorModel(ipo);
  const listing = listingModel(ipo);
  const allotment = allotmentModel(ipo);
  const documents = documentModel(ipo, documentLink);
  const allotmentUrl = allotmentLink(ipo.registrar);

  function select(id: DetailSectionId) {
    activeRef.current = id;
    setActive(id);
    const y = offsets.current[id];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - mobileTheme.spacing[2]), animated: true });
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y + mobileTheme.spacing[4];
    let next: DetailSectionId = "overview";
    for (const section of detailSections) {
      const top = offsets.current[section.id];
      if (top !== undefined && y >= top) next = section.id;
    }
    if (next !== activeRef.current) {
      activeRef.current = next;
      setActive(next);
    }
  }

  async function openExternal(url: string) {
    const safe = documentLink(url);
    if (!safe) {
      setLinkMessage("That address cannot be opened.");
      return;
    }
    try {
      await Linking.openURL(safe);
      setLinkMessage(null);
    } catch {
      setLinkMessage("The link could not be opened.");
    }
  }

  async function share() {
    if (page.url === null) return;
    try {
      await Share.share({ message: `${ipo.companyName}\n${page.url}`, url: page.url });
    } catch {
      setLinkMessage("The page could not be shared.");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="IPO sections"
        contentContainerStyle={{ gap: mobileTheme.spacing[2], paddingHorizontal: mobileTheme.spacing[4], paddingVertical: mobileTheme.spacing[2] }}
        style={{ flexGrow: 0, backgroundColor: palette.background, borderBottomWidth: 1, borderBottomColor: palette.border }}
      >
        {detailSections.map((section) => {
          const selected = active === section.id;
          return (
            <Pressable
              key={section.id}
              accessibilityRole="button"
              accessibilityLabel={section.label}
              accessibilityState={{ selected }}
              onPress={() => select(section.id)}
              style={{
                minHeight: mobileTheme.sizing.touchTarget,
                justifyContent: "center",
                paddingHorizontal: mobileTheme.spacing[3],
                borderRadius: mobileTheme.radius.full,
                backgroundColor: selected ? palette.primarySolid : palette.surface,
                borderWidth: 1,
                borderColor: selected ? palette.primarySolid : palette.border,
              }}
            >
              <AppText size="sm" weight="medium" style={{ color: selected ? palette.primaryForeground : palette.foreground }}>
                {section.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScreenContainer ref={scrollRef} safeBottom refreshing={refreshing} onRefresh={onRefresh} onScroll={onScroll}>
        {notice ? (
          <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
            {notice}
          </AppText>
        ) : null}
        {linkMessage ? (
          <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
            {linkMessage}
          </AppText>
        ) : null}

        <View onLayout={(event) => { offsets.current.overview = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <View style={{ gap: mobileTheme.spacing[2] }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: mobileTheme.spacing[2] }}>
              <AppText size="sm" weight="semibold" style={{ color: palette.link }}>
                {boardLabel(ipo.board)}
              </AppText>
              <StatusBadge status={ipo.status} allotmentConfirmed={ipo.allotmentConfirmed} />
            </View>
            <AppText weight="semibold" size="xl" accessibilityRole="header">
              {ipo.companyName}
            </AppText>
            <AppText size="sm" tone="muted">
              {boardLabel(ipo.board)} issue. {overview.statusLabel}.
            </AppText>
            <DataFreshnessLabel provenance={ipo.provenance} />
            <AppText size="sm" tone="muted">
              Source: {ipo.provenance.sourceName}
            </AppText>
          </View>
          {savedSummary ? <WatchSaveButton ipo={savedSummary} /> : null}
          <CompareToggle slug={ipo.slug} />
          {"message" in page ? (
            <AppText size="sm" tone="muted">
              {page.message}
            </AppText>
          ) : (
            <PrimaryButton label="Share" onPress={() => void share()} />
          )}
          <JourneyTimeline ipo={ipo} />
          <SectionHeader title="Overview" description="Issue size, price band, lot size, minimum investment, registrar, and published dates. Missing values stay unavailable." />
          <FactCard
            facts={overview.facts}
            footer="Exchange listing (NSE/BSE) is not stored on the public IPO document. Issue category uses Mainboard or SME."
          />
          <SectionHeader title="About the company" description="Company overview from the stored IPO Guru Pro profile when present." />
          {profile.hasCompanyCopy ? (
            <AppCard>
              {overview.about ? <AppText style={{ lineHeight: 22 }}>{overview.about}</AppText> : null}
              {overview.description ? (
                <AppText size="sm" tone="muted" style={{ lineHeight: 22 }}>
                  {overview.description}
                </AppText>
              ) : null}
            </AppCard>
          ) : (
            <EmptyState title="Company overview unavailable" description="About and description stay blank until a stored details profile is present." />
          )}
          <NarrativeList title="Strengths" items={profile.strengths} />
          <NarrativeList title="Risks" items={profile.risks} />
          {profile.promoters.length > 0 || profile.promoterNarrative ? (
            <AppCard>
              <AppText weight="semibold">Promoters</AppText>
              {profile.promoterNarrative ? <AppText style={{ lineHeight: 22 }}>{profile.promoterNarrative}</AppText> : null}
              {profile.promoters.map((promoter) => (
                <View key={promoter.name} style={{ gap: mobileTheme.spacing[1] }}>
                  <AppText weight="medium">{promoter.name}</AppText>
                  {promoter.profile ? (
                    <AppText size="sm" tone="muted" style={{ lineHeight: 20 }}>
                      {promoter.profile}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </AppCard>
          ) : null}
          {profile.objects ? (
            <AppCard>
              <AppText weight="semibold">Objects of the issue</AppText>
              {profile.objects.items.length > 0
                ? profile.objects.items.map((item) => (
                    <AppText key={item} size="sm" style={{ lineHeight: 22 }}>
                      {item}
                    </AppText>
                  ))
                : profile.objects.text ? (
                    <AppText style={{ lineHeight: 22 }}>{profile.objects.text}</AppText>
                  ) : null}
            </AppCard>
          ) : null}
        </View>

        <View onLayout={(event) => { offsets.current.gmp = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <SectionHeader title="GMP" description="Current premium in rupees and percent. A missing premium is unavailable, not ₹0." />
          {gmp.missing ? (
            <EmptyState title="GMP unavailable" description="This issue has no stored grey-market premium. Charts stay empty rather than inventing a ₹0 premium." />
          ) : (
            <FactCard
              facts={[
                { label: "Current GMP (₹)", value: gmp.amount },
                { label: "GMP (%)", value: gmp.percent },
                { label: "Freshness", value: gmp.freshness },
                { label: "Indicative price", value: gmp.indicative },
                { label: "Observed", value: gmp.updated },
              ]}
              footer={[gmp.indicativeNote, gmp.disclaimer].filter(Boolean).join(" ")}
            />
          )}
          <GmpHistoryPanels history={gmpHistory} />
        </View>

        <View onLayout={(event) => { offsets.current.subscription = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <SectionHeader title="Subscription" description="Times subscribed. A missing multiple stays unavailable. A published zero is 0x." />
          {ipo.subscription ? (
            <AppCard>
              <FactLine label="Overall" value={subscription.total} />
              {subscription.rows.map((row) => (
                <View key={row.label} style={{ gap: mobileTheme.spacing[1] }}>
                  <FactLine label={row.label} value={row.value} />
                  {row.children.map((child) => (
                    <AppText key={child.label} size="sm" tone="muted">
                      {child.label}: {child.value}
                    </AppText>
                  ))}
                </View>
              ))}
              <AppText size="sm" tone={ipo.subscription.freshness === "stale" ? "warning" : "muted"}>
                {subscription.freshness}. {subscription.updated}
              </AppText>
            </AppCard>
          ) : (
            <EmptyState title="Subscription is not stored" description="Category figures stay blank when this issue has no subscription snapshot." />
          )}
          <SubscriptionHistoryPanels history={subscriptionHistory} snapshot={ipo.subscription} />
        </View>

        <View onLayout={(event) => { offsets.current.financials = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <SectionHeader title="Financials" description="Revenue and profit are in rupees for each reporting period. Source rows keep the published unit." />
          {financials.periods.map((period) => (
            <FactCard
              key={period.period}
              title={period.period}
              facts={[
                { label: "Revenue (₹)", value: period.revenue },
                { label: "Profit after tax (₹)", value: period.profit },
                { label: "Earnings per share (₹)", value: period.earnings },
              ]}
            />
          ))}
          {financials.rows.length > 0 ? (
            <AppText size="sm" tone="muted">
              {financials.unit ? `Source figures are in ${financials.unit}.` : "The source did not name a unit."}
            </AppText>
          ) : null}
          {financials.rows.map((row) => (
            <FactCard
              key={row.metric}
              title={row.metric}
              facts={row.values.map((value, index) => ({
                label: financials.headers[index] ?? "Period",
                value,
              }))}
            />
          ))}
          {financials.text ? (
            <AppCard>
              <AppText style={{ lineHeight: 22 }}>{financials.text}</AppText>
            </AppCard>
          ) : null}
          {financials.empty ? (
            <EmptyState title="No financials are stored" description="Revenue, profit, and source tables stay blank when the document does not include them." />
          ) : null}
          {anchors.investors.length > 0 ? (
            <View style={{ gap: mobileTheme.spacing[3] }}>
              <SectionHeader title="Anchor investors" description="Amounts are in ₹ crore. Percentages are the figures published by the source." />
              {anchors.summary.length > 0 ? <FactCard facts={anchors.summary} /> : null}
              {anchors.investors.map((investor) => (
                <FactCard
                  key={`${investor.name}-${investor.group ?? "group"}`}
                  title={investor.name}
                  facts={[
                    ...(investor.group ? [{ label: "Group", value: investor.group }] : []),
                    { label: "Shares", value: investor.shares },
                    { label: "Amount (₹ crore)", value: investor.amount },
                    { label: "Share of anchor book", value: investor.allocatedPercent },
                    { label: "Share of issue", value: investor.issuePercent },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View onLayout={(event) => { offsets.current.allotment = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <SectionHeader title="Allotment" description="Allotment Out requires a stored confirmation. A passed allotment date alone stays Allotment Awaited. PAN and application numbers are not collected here." />
          <FactCard
            facts={[
              { label: "Status", value: allotment.status },
              { label: "Allotment date", value: allotment.date },
              { label: "Registrar", value: allotment.registrar },
            ]}
          />
          <PrimaryButton
            label="Check Allotment"
            disabled={!allotmentUrl}
            onPress={() => {
              if (allotmentUrl) void openExternal(allotmentUrl);
            }}
          />
          <AppText size="sm" tone="muted">
            {allotmentUrl
              ? allotment.confirmed
                ? "Allotment Out. Check Allotment opens the verified official registrar website. Sign-in is not required."
                : "Allotment Awaited. Check Allotment opens the verified official registrar website. Sign-in is not required."
              : "The official registrar link is unavailable, so Check Allotment stays disabled."}
          </AppText>
        </View>

        <View onLayout={(event) => { offsets.current.listing = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <SectionHeader title="Listing" description="Actual change from issue price to listing price. Separate from the unofficial GMP estimate." />
          <FactCard facts={listing} />
        </View>

        <View onLayout={(event) => { offsets.current.documents = event.nativeEvent.layout.y; }} style={{ gap: mobileTheme.spacing[3] }}>
          <SectionHeader title="Documents" description="RHP, DRHP, and other links that passed the address check. Unverified addresses are left out." />
          {documents.length === 0 ? (
            <EmptyState title="No documents are stored" description="DRHP, RHP, and other source documents appear here when the issue includes them." />
          ) : (
            <AppCard>
              {documents.map((document) => (
                <Pressable
                  key={document.url}
                  accessibilityRole="link"
                  accessibilityLabel={`${document.label}. ${document.title}`}
                  onPress={() => void openExternal(document.url)}
                  style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center", gap: mobileTheme.spacing[1] }}
                >
                  <AppText weight="medium" style={{ color: palette.link }}>
                    {document.label}: {document.title}
                  </AppText>
                  {document.published !== "Unavailable" ? (
                    <AppText size="sm" tone="muted">
                      {document.published}
                    </AppText>
                  ) : null}
                </Pressable>
              ))}
            </AppCard>
          )}
        </View>
        {ipo.provenance.sourceName.toLowerCase().includes("ipo guru") ? <SourceAttribution retrievedAt={ipo.provenance.retrievedAt} /> : null}
      </ScreenContainer>
    </View>
  );
}
