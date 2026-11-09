import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicArticleDetail } from "@ipo-singh/contracts";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Linking, Pressable, Share, View } from "react-native";
import { MobileApiError } from "../api/errors";
import { deviceJsonCache } from "../catalogue/device-store";
import { issueRoute } from "../catalogue/routes";
import { loadArticleDetail } from "../content/load";
import { absoluteArticleMediaUrl, articleBodyParagraphs, articleCategoryText, articlePublishedLabel } from "../content/model";
import { AppText } from "../components/app-text";
import { ErrorState } from "../components/error-state";
import { LoadingSkeleton } from "../components/loading-skeleton";
import { PrimaryButton } from "../components/primary-button";
import { ScreenContainer } from "../components/screen-container";
import { useOnReconnect } from "../network/provider";
import { safeCitationUrl } from "../security/urls";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { readCatalogueTarget } from "./catalogue-target";

type DetailState =
  | { phase: "loading" }
  | { phase: "ready"; article: PublicArticleDetail; disclaimer: string; notice: string | null }
  | { phase: "error"; message: string };

export function NewsDetailScreen({ slug }: { slug: string }) {
  const { palette } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DetailState>({ phase: "loading" });
  const [coverFailed, setCoverFailed] = useState(false);
  const [mediaOrigin, setMediaOrigin] = useState("");
  const softRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const soft = softRef.current;
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
        const result = await loadArticleDetail({
          origin: target.origin,
          slug,
          offline: target.offline,
          cache: deviceJsonCache(),
          now: new Date(),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.status === "ready") {
          setState({ phase: "ready", article: result.article, disclaimer: result.disclaimer, notice: result.notice });
        } else if (!soft) {
          setState({ phase: "error", message: result.message });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        if (!soft) setState({ phase: "error", message: "That article could not be loaded." });
      }
    })();
    return () => controller.abort();
  }, [attempt, slug]);

  const softReload = useCallback(() => {
    softRef.current = true;
    setAttempt((value) => value + 1);
  }, []);

  useOnReconnect(softReload);

  const coverUrl =
    state.phase === "ready" && state.article.cover
      ? absoluteArticleMediaUrl(mediaOrigin, state.article.cover.url) ?? safeCitationUrl(state.article.cover.url)
      : null;
  const coverAlt = state.phase === "ready" ? state.article.cover?.alt : undefined;

  return (
    <ScreenContainer>
      {state.phase === "loading" ? <LoadingSkeleton label="Loading article" /> : null}
      {state.phase === "error" ? (
        <ErrorState
          title="Article unavailable"
          message={state.message}
          action={
            <PrimaryButton
              label="Try again"
              onPress={() => {
                setState({ phase: "loading" });
                setAttempt((value) => value + 1);
              }}
            />
          }
        />
      ) : null}
      {state.phase === "ready" ? (
        <View style={{ gap: mobileTheme.spacing[3] }}>
          {state.notice ? (
            <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
              {state.notice}
            </AppText>
          ) : null}
          <AppText size="xs" weight="semibold" tone="muted">
            {articleCategoryText(state.article.category)}
          </AppText>
          <AppText size="xl" weight="bold" accessibilityRole="header">
            {state.article.title}
          </AppText>
          <AppText size="sm" tone="muted">
            {articlePublishedLabel(state.article.publishedAt)} · {state.article.authorName} · Source {state.article.sourceName}
          </AppText>
          {coverUrl && !coverFailed ? (
            <Image
              source={{ uri: coverUrl }}
              style={{ width: "100%", height: 180, borderRadius: mobileTheme.radius.lg }}
              contentFit="cover"
              accessibilityLabel={coverAlt}
              onError={() => setCoverFailed(true)}
            />
          ) : null}
          <AppText size="sm">{state.article.summary}</AppText>
          {articleBodyParagraphs(state.article.bodyMarkdown).map((paragraph, index) => (
            <AppText key={`${state.article.id}-${index}`} style={{ lineHeight: mobileTheme.fontSize.base * 1.6 }}>
              {paragraph}
            </AppText>
          ))}
          {state.article.relatedIpoSlugs.length > 0 ? (
            <View style={{ gap: mobileTheme.spacing[2] }}>
              <AppText weight="semibold">Related IPOs</AppText>
              {state.article.relatedIpoSlugs.map((related) => {
                const route = issueRoute(related);
                return (
                  <Pressable
                    key={related}
                    accessibilityRole="link"
                    accessibilityLabel={`Open IPO ${related}`}
                    disabled={!route}
                    onPress={() => {
                      if (route) router.push(route);
                    }}
                    style={{
                      minHeight: mobileTheme.sizing.touchTarget,
                      justifyContent: "center",
                      borderBottomWidth: 1,
                      borderBottomColor: palette.border,
                    }}
                  >
                    <AppText weight="medium" style={{ color: palette.link }}>
                      {related}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {state.article.citations.length > 0 ? (
            <View style={{ gap: mobileTheme.spacing[2] }}>
              <AppText weight="semibold">Sources</AppText>
              {state.article.citations.map((citation) => {
                const href = safeCitationUrl(citation.url);
                if (!href) return null;
                return (
                  <Pressable
                    key={`${citation.label}-${citation.url}`}
                    accessibilityRole="link"
                    accessibilityLabel={citation.label}
                    onPress={() => {
                      void Linking.openURL(href).catch(() => undefined);
                    }}
                    style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
                  >
                    <AppText size="sm" style={{ color: palette.link }}>
                      {citation.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <PrimaryButton
            label="Share"
            onPress={() => {
              void Share.share({
                message: `${state.article.title}\n${state.article.summary}`,
                title: state.article.title,
              }).catch(() => undefined);
            }}
          />
          <AppText size="sm" tone="muted">
            {state.disclaimer}
          </AppText>
        </View>
      ) : null}
    </ScreenContainer>
  );
}
