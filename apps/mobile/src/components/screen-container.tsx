import { forwardRef, type ComponentRef, type ReactNode } from "react";
import { RefreshControl, ScrollView, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { screenContentInset } from "../design/layout";
import { useTheme } from "../theme/provider";

type ScreenContainerProps = {
  children: ReactNode;
  safeBottom?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  keyboardDismissMode?: "none" | "on-drag" | "interactive";
};

export const ScreenContainer = forwardRef<ComponentRef<typeof ScrollView>, ScreenContainerProps>(function ScreenContainer(
  { children, safeBottom = false, refreshing = false, onRefresh, onScroll, keyboardDismissMode = "none" },
  ref,
) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inset = screenContentInset(width);

  return (
    <ScrollView
      ref={ref}
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        flexGrow: 1,
        width: "100%",
        maxWidth: inset.maxWidth,
        alignSelf: "center",
        paddingTop: inset.paddingTop,
        paddingBottom: inset.paddingBottom + (safeBottom ? insets.bottom : 0),
        paddingLeft: inset.paddingHorizontal + insets.left,
        paddingRight: inset.paddingHorizontal + insets.right,
        gap: inset.gap,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={keyboardDismissMode}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primarySolid} colors={[palette.primarySolid]} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
});
