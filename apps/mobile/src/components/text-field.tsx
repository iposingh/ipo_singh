import { TextInput, View, type KeyboardTypeOptions } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";
import { AppText } from "./app-text";

export function TextField({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = "default",
  autoComplete,
  maxLength = 128,
  onSubmit,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: "email" | "password" | "name" | "off";
  maxLength?: number;
  onSubmit?: () => void;
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
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        placeholderTextColor={palette.muted}
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
