import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { canCompare } from "../discovery/selection";
import { useCompareSelection } from "../discovery/compare-selection";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";
import { PrimaryButton } from "./primary-button";

export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View accessibilityLabel={label} style={{ gap: mobileTheme.spacing[2] }}>
      <AppText size="sm" weight="medium">{label}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileTheme.spacing[2] }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
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
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CompareToggle({ slug }: { slug: string }) {
  const { palette } = useTheme();
  const { slugs, toggle } = useCompareSelection();
  const selected = slugs.includes(slug);
  const full = !selected && slugs.length >= 4;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={selected ? "Remove from comparison" : "Add to comparison"}
      accessibilityState={{ selected, disabled: full }}
      disabled={full}
      onPress={() => toggle(slug)}
      style={{ minHeight: mobileTheme.sizing.touchTarget, justifyContent: "center" }}
    >
      <AppText weight="medium" style={{ color: full ? palette.disabledForeground : selected ? palette.positiveText : palette.link }}>
        {selected ? "Remove from comparison" : full ? "Comparison is full" : "Add to comparison"}
      </AppText>
    </Pressable>
  );
}

export function CompareBar() {
  const { slugs, notice } = useCompareSelection();
  if (slugs.length === 0 && !notice) return null;
  const ready = canCompare(slugs);
  const count = slugs.length === 1 ? "1 IPO selected. Choose 2 to 4." : `${slugs.length} IPOs selected.`;
  return (
    <View style={{ gap: mobileTheme.spacing[2], padding: mobileTheme.spacing[4] }}>
      <AppText>{count}</AppText>
      {notice ? <AppText size="sm" tone="warning">{notice}</AppText> : null}
      <PrimaryButton label="Compare" disabled={!ready} onPress={() => router.push("/compare")} />
    </View>
  );
}
