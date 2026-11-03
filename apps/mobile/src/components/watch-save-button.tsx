import { useState } from "react";
import type { IpoSummary } from "@ipo-singh/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/provider";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { useWatchlist } from "../watchlist/provider";
import { AppText } from "./app-text";
import { PrimaryButton } from "./primary-button";

export function WatchSaveButton({ ipo }: { ipo: IpoSummary }) {
  const { state } = useAuth();
  const watchlist = useWatchlist();
  const { palette } = useTheme();
  const [promptOpen, setPromptOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const saved = watchlist.saved(ipo.id);
  const label = saved ? `Remove ${ipo.companyName} from the watchlist` : `Save ${ipo.companyName} to the watchlist`;

  async function onPress() {
    if (pending) return;
    if (state.phase !== "ready") {
      if (state.phase === "loading") setMessage("The account is still loading.");
      else if (state.phase === "offline") setMessage("The watchlist could not be changed while offline.");
      else {
        setMessage(null);
        setPromptOpen(true);
      }
      return;
    }
    setPending(true);
    setMessage(await watchlist.toggle(ipo));
    setPending(false);
  }

  return (
    <View style={{ gap: mobileTheme.spacing[1] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: saved, busy: pending, disabled: pending }}
        disabled={pending}
        onPress={() => {
          void onPress();
        }}
        style={({ pressed }) => ({
          width: mobileTheme.sizing.touchTarget,
          height: mobileTheme.sizing.touchTarget,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: saved ? palette.primarySolid : palette.border,
          borderRadius: mobileTheme.radius.md,
          backgroundColor: saved ? palette.primarySolid : palette.surface,
          opacity: pressed || pending ? 0.7 : 1,
        })}
      >
        <Ionicons
          name={saved ? "bookmark" : "bookmark-outline"}
          size={20}
          color={saved ? palette.primaryForeground : palette.foreground}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      </Pressable>
      {message ? (
        <AppText size="sm" tone="warning" accessibilityLiveRegion="polite">
          {message}
        </AppText>
      ) : null}
      <Modal visible={promptOpen} transparent animationType="fade" onRequestClose={() => setPromptOpen(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sign-in prompt"
          onPress={() => setPromptOpen(false)}
          style={{ flex: 1, justifyContent: "center", backgroundColor: "#0F172A66", padding: mobileTheme.spacing[4] }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              gap: mobileTheme.spacing[3],
              borderRadius: mobileTheme.radius.lg,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
              padding: mobileTheme.spacing[4],
            }}
          >
            <AppText weight="semibold" size="lg">
              Save this IPO
            </AppText>
            <AppText size="sm" tone="muted">
              Sign in to save IPOs to your watchlist.
            </AppText>
            <PrimaryButton
              label="Sign In"
              onPress={() => {
                setPromptOpen(false);
                router.push("/(tabs)/settings");
              }}
            />
            <PrimaryButton
              label="Create Account"
              onPress={() => {
                setPromptOpen(false);
                router.push("/(tabs)/settings");
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={() => setPromptOpen(false)}
              style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
            >
              <AppText weight="medium" style={{ color: palette.link, textAlign: "center" }}>
                Not now
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
