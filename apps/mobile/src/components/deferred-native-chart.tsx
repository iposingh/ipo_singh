import { useEffect, useState, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { LoadingSkeleton } from "./loading-skeleton";

/**
 * Defers mounting gifted-charts / SVG natives until after the detail shell paints.
 * Simultaneous LineChart mounts on Android have frozen the IPO detail bridge.
 */
export function DeferredNativeChart({
  children,
  height = 168,
  label = "Preparing chart",
  staggerMs = 0,
}: {
  children: ReactNode;
  height?: number;
  label?: string;
  staggerMs?: number;
}): ReactNode {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const delay = Platform.OS === "android" ? Math.max(staggerMs, 48) : staggerMs;
      timeout = setTimeout(() => {
        if (!cancelled) setReady(true);
      }, delay);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  }, [staggerMs]);

  if (!ready) {
    return (
      <View style={{ height, justifyContent: "center" }}>
        <LoadingSkeleton label={label} />
      </View>
    );
  }

  return <View style={{ minHeight: height, overflow: "hidden" }}>{children}</View>;
}
