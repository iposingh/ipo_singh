import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicArticleSummary } from "@ipo-singh/contracts";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, TextInput, View } from "react-native";
import { MobileApiError } from "../api/errors";
import { deviceJsonCache } from "../catalogue/device-store";
import { loadArticleList } from "../content/load";
import { useOnReconnect } from "../network/provider";
import {
  absoluteArticleMediaUrl,
  articleCardAccessibilityLabel,
  articleCategoryText,
  articlePublishedLabel,
  contentCategoryChoices,
  contentDisclaimer,
  type ContentCategoryFilter,
} from "../content/model";
import { AppText } from "../components/app-text";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { FilterChips } from "../components/discovery-controls";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { SectionHeader } from "../components/section-header";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { readCatalogueTarget } from "./catalogue-target";

type ListState =
  | { phase: "loading" }
  | { phase: "ready"; items: PublicArticleSummary[]; disclaimer: string; notice: string | null; nextCursor: string | null }
  | { phase: "error"; message: string };

export function NewsListScreen() {
  const { palette } = useTheme();
  const [category, setCategory] = useState<ContentCategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [state, setState] = useState<ListState>({ phase: "loading" });
  const [mediaOrigin, setMediaOrigin] = useState("");
  const forceRef = useRef(false);
  const softRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const force = forceRef.current;
    const soft = softRef.current;
    forceRef.current = false;
    softRef.current = false;
    void (async () => {
      if (!soft) setState({ phase: "loading" });
      const target = await readCatalogueTarget();
      if (controller.signal.aborted) return;
      if ("error" in target) {
        if (soft) return;
        setState({ phase: "error", message: target.error });
        return;
      }
      setMediaOrigin(target.origin);
      try {
        const result = await loadArticleList({
          origin: target.origin,
          offline: target.offline,
          force,
          cache: deviceJsonCache(),
          now: new Date(),
          category,
          q: submitted || undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.status === "ready") {
          setState({
            phase: "ready",
            items: result.items,
            disclaimer: result.disclaimer,
            notice: result.notice,
            nextCursor: result.nextCursor ?? null,
          });
        } else if (!soft) {
          setState({ phase: "error", message: result.message });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        if (!soft) setState({ phase: "error", message: "Articles could not be loaded." });
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    })();
    return () => controller.abort();
  }, [attempt, category, submitted]);

  const softReload = useCallback(() => {
    softRef.current = true;
    setAttempt((value) => value + 1);
  }, []);

  useOnReconnect(softReload);

  function reload() {
    forceRef.current = true;
    setRefreshing(true);
    setAttempt((value) => value + 1);
  }

  async function loadMore() {
    if (state.phase !== "ready" || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const target = await readCatalogueTarget();
    if ("error" in target) {
      setLoadingMore(false);
      return;
    }
    try {
      const result = await loadArticleList({
        origin: target.origin,
        offline: target.offline,
        force: true,
        cache: deviceJsonCache(),
        now: new Date(),
        category,
        q: submitted || undefined,
        cursor: state.nextCursor,
      });
      if (result.status === "ready") {
        setState({
          phase: "ready",
          items: [...state.items, ...result.items],
          disclaimer: result.disclaimer,
          notice: result.notice,
          nextCursor: result.nextCursor ?? null,
        });
      }
    } catch {
      // Keep the already-loaded page visible.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={reload}>
      <SectionHeader title="News" />
      <FilterChips label="Category" value={category} onChange={setCategory} options={contentCategoryChoices} />
      <View style={{ gap: mobileTheme.spacing[2] }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setSubmitted(query.trim())}
          placeholder="Search published articles"
          placeholderTextColor={palette.muted}
          accessibilityLabel="Search published articles"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            minHeight: mobileTheme.sizing.touchTarget,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: mobileTheme.radius.md,
            paddingHorizontal: mobileTheme.spacing[3],
            color: palette.foreground,
            backgroundColor: palette.surface,
          }}
        />
        <PrimaryButton label="Search" onPress={() => setSubmitted(query.trim())} />
      </View>
      {state.phase === "loading" ? <LoadingSkeleton label="Loading articles" /> : null}
      {state.phase === "error" ? (
        <ErrorState
          title="Articles could not be loaded"
          message={state.message}
          action={
            <PrimaryButton
              label="Try again"
              onPress={() => {
                forceRef.current = true;
                setState({ phase: "loading" });
                setAttempt((value) => value + 1);
              }}
            />
          }
        />
      ) : null}
      {state.phase === "ready" && state.notice ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {state.notice}
        </AppText>
      ) : null}
      {state.phase === "ready" && state.items.length === 0 ? (
        <EmptyState
          title="No published articles yet"
          description="When IPO Singh publishes guides or updates, they appear here. No sample or fictional news is shown."
        />
      ) : null}
      {state.phase === "ready"
        ? state.items.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              origin={mediaOrigin}
              onPress={() => router.push({ pathname: "/news/[slug]", params: { slug: article.slug } })}
            />
          ))
        : null}
      {state.phase === "ready" && state.nextCursor ? (
        <PrimaryButton label="Load more" loading={loadingMore} onPress={() => void loadMore()} />
      ) : null}
      <AppText size="sm" tone="muted">
        {state.phase === "ready" ? state.disclaimer : contentDisclaimer}
      </AppText>
    </ScreenContainer>
  );
}

function ArticleCard({ article, origin, onPress }: { article: PublicArticleSummary; origin: string; onPress: () => void }) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  const coverUri = absoluteArticleMediaUrl(origin, article.cover?.url);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={articleCardAccessibilityLabel(article)}
      onPress={onPress}
      style={{
        gap: mobileTheme.spacing[2],
        padding: mobileTheme.spacing[3],
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: mobileTheme.radius.lg,
        backgroundColor: palette.surface,
      }}
    >
      {coverUri && !failed ? (
        <Image
          source={{ uri: coverUri }}
          style={{ width: "100%", height: 140, borderRadius: mobileTheme.radius.md }}
          contentFit="cover"
          accessibilityLabel={article.cover?.alt ?? article.title}
          onError={() => setFailed(true)}
        />
      ) : null}
      <AppText size="xs" weight="semibold" tone="muted">
        {articleCategoryText(article.category)}
      </AppText>
      <AppText weight="semibold">{article.title}</AppText>
      <AppText size="sm">{article.summary}</AppText>
      <AppText size="sm" tone="muted">
        {articlePublishedLabel(article.publishedAt)} · Source {article.sourceName}
      </AppText>
    </Pressable>
  );
}
