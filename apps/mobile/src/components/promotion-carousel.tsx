import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, FlatList, Linking, Pressable, View, type LayoutChangeEvent } from "react-native";
import { issueRoute } from "../catalogue/routes";
import { deviceJsonCache } from "../catalogue/device-store";
import { readAppEnvironment } from "../api/origin";
import { readCatalogueTarget } from "../screens/catalogue-target";
import { MobileApiError } from "../api/errors";
import { useOnReconnect } from "../network/provider";
import { trackPromotionEvent } from "../promotions/analytics";
import { loadPromotions } from "../promotions/load";
import {
  autoplayAllowed,
  bannerFrame,
  houseBanners,
  nextSlideIndex,
  promotionAccessibilityLabel,
  promotionAutoplayMs,
  promotionImageCachePolicy,
  type MobileBanner,
  type PromotionDestination,
} from "../promotions/model";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

const scrimLight = "rgba(8, 15, 26, 0.78)";
const scrimDark = "rgba(4, 8, 14, 0.82)";
const overlayText = "#FFFFFF";

export function PromotionCarousel({ refreshing }: { refreshing: boolean }) {
  const state = useHomePromotions(refreshing);
  if (!state.ready) return <PromotionSkeleton />;
  if (state.banners.length === 0) return null;
  const key = state.banners.map((banner) => banner.id).join("\n");
  return (
    <View style={{ gap: mobileTheme.spacing[2] }}>
      {state.notice ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {state.notice}
        </AppText>
      ) : null}
      <PromotionTrack key={key} banners={state.banners} origin={state.origin} />
    </View>
  );
}

function useHomePromotions(refreshing: boolean): {
  banners: MobileBanner[];
  notice: string | null;
  ready: boolean;
  origin: string | null;
} {
  const [state, setState] = useState<{
    banners: MobileBanner[];
    notice: string | null;
    ready: boolean;
    origin: string | null;
  }>({
    banners: [],
    notice: null,
    ready: false,
    origin: null,
  });
  const [softKey, setSoftKey] = useState(0);

  useEffect(() => {
    let active = true;
    const force = refreshing;
    void (async () => {
      try {
        const target = await readCatalogueTarget();
        if (!active) return;
        if ("error" in target) {
          setState({ banners: houseBanners(), notice: null, ready: true, origin: null });
          return;
        }
        const result = await loadPromotions({
          origin: target.origin,
          site: process.env.EXPO_PUBLIC_IPO_SINGH_SITE_URL,
          appEnv: readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__),
          offline: target.offline,
          force,
          cache: deviceJsonCache(),
          now: new Date(),
        });
        if (!active) return;
        setState({ banners: result.banners, notice: result.notice, ready: true, origin: target.origin });
      } catch (error) {
        if (error instanceof MobileApiError && error.kind === "cancelled") return;
        if (!active) return;
        setState({ banners: houseBanners(), notice: null, ready: true, origin: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshing, softKey]);

  const softReload = useCallback(() => {
    setSoftKey((value) => value + 1);
  }, []);

  useOnReconnect(softReload);

  return state;
}

function PromotionSkeleton() {
  const { palette } = useTheme();
  return (
    <View
      accessibilityLabel="Loading promotions"
      accessibilityRole="progressbar"
      style={{
        height: 160,
        borderRadius: mobileTheme.radius.lg,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
      }}
    />
  );
}

function PromotionTrack({ banners, origin }: { banners: MobileBanner[]; origin: string | null }) {
  const { palette, colorScheme } = useTheme();
  const reduced = useReducedMotion();
  const listRef = useRef<FlatList<MobileBanner>>(null);
  const scrollMode = useRef<"gesture" | "control" | null>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [announcement, setAnnouncement] = useState("");
  const frame = bannerFrame(width);
  const count = banners.length;
  const current = banners[index] ?? banners[0];

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setAppActive(next === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!autoplayAllowed({ count, paused, reducedMotion: reduced, interacting, focused, appActive })) return;
    const timer = setInterval(() => {
      scrollMode.current = "control";
      setIndex((value) => nextSlideIndex(value, count, 1));
    }, promotionAutoplayMs);
    return () => clearInterval(timer);
  }, [appActive, count, focused, interacting, paused, reduced]);

  useEffect(() => {
    if (width <= 0) return;
    if (scrollMode.current === "gesture") {
      scrollMode.current = null;
      return;
    }
    const animated = scrollMode.current === "control" && !reduced;
    scrollMode.current = null;
    if (index === 0 && !animated) return;
    listRef.current?.scrollToIndex({ index, animated });
  }, [index, reduced, width]);

  useEffect(() => {
    if (!origin || !current || !appActive) return;
    void trackPromotionEvent({ origin, bannerId: current.id, event: "impression" });
  }, [appActive, current, origin]);

  function show(next: number) {
    const safe = nextSlideIndex(next, count, 0);
    const banner = banners[safe];
    scrollMode.current = "control";
    setIndex(safe);
    if (banner) setAnnouncement(promotionAccessibilityLabel(banner, safe, count));
  }

  function pauseForFocus() {
    setFocused(true);
  }

  function resumeAfterFocus() {
    setFocused(false);
  }

  function onLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  return (
    <View accessibilityLabel="IPO Singh promotions" onLayout={onLayout} style={{ gap: mobileTheme.spacing[2] }}>
      <AppText accessibilityLiveRegion="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        {announcement}
      </AppText>
      {width > 0 && current ? (
        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          data={banners}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={count > 1}
          nestedScrollEnabled
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          }}
          onScrollBeginDrag={() => setInteracting(true)}
          onScrollEndDrag={() => setInteracting(false)}
          onMomentumScrollEnd={(event) => {
            const next = width > 0 ? Math.round(event.nativeEvent.contentOffset.x / width) : 0;
            const safe = nextSlideIndex(next, count, 0);
            scrollMode.current = "gesture";
            setIndex(safe);
            const banner = banners[safe];
            if (banner) setAnnouncement(promotionAccessibilityLabel(banner, safe, count));
            setInteracting(false);
          }}
          renderItem={({ item, index: itemIndex }) => (
            <PromotionSlide
              banner={item}
              index={itemIndex}
              count={count}
              width={width}
              height={frame.height}
              dark={colorScheme === "dark"}
              origin={origin}
              priority={itemIndex === 0}
              onFocus={pauseForFocus}
              onBlur={resumeAfterFocus}
            />
          )}
        />
      ) : (
        <View
          style={{
            height: frame.height || 160,
            borderRadius: mobileTheme.radius.lg,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
          }}
        />
      )}
      {count > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: mobileTheme.spacing[2] }}>
          <ControlButton label="Previous promotion" onPress={() => show(index - 1)} onFocus={pauseForFocus} onBlur={resumeAfterFocus} />
          {reduced ? null : (
            <ControlButton
              label={paused ? "Play promotions" : "Pause promotions"}
              onPress={() => setPaused((value) => !value)}
              onFocus={pauseForFocus}
              onBlur={resumeAfterFocus}
            />
          )}
          <ControlButton label="Next promotion" onPress={() => show(index + 1)} onFocus={pauseForFocus} onBlur={resumeAfterFocus} />
          {banners.map((banner, dotIndex) => (
            <Pressable
              key={banner.id}
              accessibilityRole="button"
              accessibilityLabel={`Show promotion ${dotIndex + 1} of ${count}`}
              accessibilityState={{ selected: dotIndex === index }}
              onPress={() => show(dotIndex)}
              onFocus={pauseForFocus}
              onBlur={resumeAfterFocus}
              style={{ minWidth: mobileTheme.sizing.touchTarget, minHeight: mobileTheme.sizing.touchTarget, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: mobileTheme.radius.full,
                  backgroundColor: dotIndex === index ? palette.primarySolid : palette.border,
                }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PromotionSlide({
  banner,
  index,
  count,
  width,
  height,
  dark,
  origin,
  priority,
  onFocus,
  onBlur,
}: {
  banner: MobileBanner;
  index: number;
  count: number;
  width: number;
  height: number;
  dark: boolean;
  origin: string | null;
  priority: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  const remote = banner.image.kind === "remote" && !failed;
  const textColor = remote ? overlayText : palette.primaryForeground;
  const brandTint = dark ? palette.primaryForeground : palette.primaryForeground;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={promotionAccessibilityLabel(banner, index, count)}
      accessibilityHint={banner.destination.kind === "external" || banner.destination.kind === "website" ? "Opens the website" : undefined}
      onPress={() => {
        if (origin) void trackPromotionEvent({ origin, bannerId: banner.id, event: "click" });
        openPromotion(banner.destination);
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{
        width,
        height,
        borderRadius: mobileTheme.radius.lg,
        overflow: "hidden",
        backgroundColor: palette.primarySolid,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      {banner.image.kind === "remote" && !failed ? (
        <Image
          source={{ uri: banner.image.url }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy={promotionImageCachePolicy}
          recyclingKey={banner.image.url}
          priority={priority ? "high" : "low"}
          transition={100}
          accessible={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <BrandArt color={brandTint} tone={banner.image.kind === "brand" ? banner.image.tone : "mainboard"} />
      )}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          gap: mobileTheme.spacing[1],
          padding: mobileTheme.spacing[3],
          backgroundColor: remote ? (dark ? scrimDark : scrimLight) : "transparent",
        }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            borderRadius: mobileTheme.radius.full,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
            paddingHorizontal: mobileTheme.spacing[2],
            paddingVertical: mobileTheme.spacing[1],
          }}
        >
          <AppText size="xs" weight="semibold">
            {banner.label}
          </AppText>
        </View>
        <AppText size="lg" weight="bold" numberOfLines={1} style={{ color: textColor }}>
          {banner.title}
        </AppText>
        <AppText size="sm" numberOfLines={2} style={{ color: textColor }}>
          {banner.description}
        </AppText>
      </View>
    </Pressable>
  );
}

function BrandArt({ color, tone }: { color: string; tone: "mainboard" | "sme" | "calendar" }) {
  const heights = tone === "calendar" ? [28, 44, 36] : tone === "sme" ? [24, 40, 56] : [20, 36, 52];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end", gap: mobileTheme.spacing[2], padding: mobileTheme.spacing[4] }}
    >
      {heights.map((barHeight, barIndex) => (
        <View key={`${tone}-${barIndex}`} style={{ width: 16, height: barHeight, borderRadius: mobileTheme.radius.sm, backgroundColor: color }} />
      ))}
    </View>
  );
}

function ControlButton({ label, onPress, onFocus, onBlur }: { label: string; onPress: () => void; onFocus: () => void; onBlur: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{
        minHeight: mobileTheme.sizing.touchTarget,
        justifyContent: "center",
        paddingHorizontal: mobileTheme.spacing[2],
        borderRadius: mobileTheme.radius.md,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
      }}
    >
      <AppText size="sm" weight="semibold">
        {label.replace(" promotion", "").replace(" promotions", "")}
      </AppText>
    </Pressable>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      if (active) setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

function openPromotion(destination: PromotionDestination) {
  if (destination.kind === "route") {
    router.push(destination.href);
    return;
  }
  if (destination.kind === "ipo") {
    const route = issueRoute(destination.slug);
    if (route) router.push(route);
    return;
  }
  void Linking.openURL(destination.url).catch(() => undefined);
}
