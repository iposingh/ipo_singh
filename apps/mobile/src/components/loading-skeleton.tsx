import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { motion } from "@ipo-singh/design-tokens";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";

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

export function LoadingSkeleton({ label = "Loading" }: { label?: string }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: motion.durationSlowMs * 3, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: motion.durationSlowMs * 3, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ gap: mobileTheme.spacing[3] }}>
      {[0, 1, 2].map((item) => (
        <Animated.View
          key={item}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            opacity,
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: mobileTheme.radius.lg,
            padding: mobileTheme.spacing[4],
            gap: mobileTheme.spacing[2],
          }}
        >
          <View style={{ height: 18, width: "70%", borderRadius: mobileTheme.radius.sm, backgroundColor: palette.border }} />
          <View style={{ height: 12, width: "40%", borderRadius: mobileTheme.radius.sm, backgroundColor: palette.border }} />
          <View style={{ height: 12, width: "90%", borderRadius: mobileTheme.radius.sm, backgroundColor: palette.border }} />
        </Animated.View>
      ))}
    </View>
  );
}
