import type { ReactNode } from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { mobileTheme } from "../theme/theme";
import { useTheme } from "../theme/provider";

type AppTextProps = TextProps & {
  children: ReactNode;
  tone?: "default" | "muted" | "positive" | "negative" | "warning";
  size?: keyof typeof mobileTheme.fontSize;
  weight?: keyof typeof mobileTheme.fontWeight;
  style?: StyleProp<TextStyle>;
};

export function AppText({ children, tone = "default", size = "base", weight = "regular", style, ...props }: AppTextProps) {
  const { palette } = useTheme();
  const fontSize = mobileTheme.fontSize[size];
  const color =
    tone === "muted" ? palette.muted : tone === "positive" ? palette.positiveText : tone === "negative" ? palette.negativeText : tone === "warning" ? palette.warningText : palette.foreground;
  return (
    <Text
      allowFontScaling
      {...props}
      style={[{ color, fontSize, lineHeight: fontSize * 1.5, fontWeight: mobileTheme.fontWeight[weight] }, style]}
    >
      {children}
    </Text>
  );
}
