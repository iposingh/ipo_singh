import { TextInput, View } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

export function SearchInput({
  label,
  value,
  onChangeText,
  onSubmit,
  placeholder = "Company name",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: mobileTheme.spacing[2] }}>
      <AppText size="sm" weight="medium" accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        allowFontScaling
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={80}
        clearButtonMode="while-editing"
        style={{
          minHeight: mobileTheme.sizing.input,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: mobileTheme.radius.md,
          backgroundColor: palette.surface,
          color: palette.foreground,
          paddingHorizontal: mobileTheme.spacing[3],
          fontSize: mobileTheme.fontSize.base,
        }}
      />
    </View>
  );
}
