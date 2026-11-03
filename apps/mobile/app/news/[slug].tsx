import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AppHeader } from "../../src/components/app-header";
import { NewsDetailScreen } from "../../src/screens/news-detail-screen";
import { safeRouteSlug } from "../../src/security/routes";
import { useTheme } from "../../src/theme/provider";

export default function NewsDetailRoute() {
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = safeRouteSlug(params.slug) ?? "";
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <AppHeader title="Article" showSearch={false} />
      <NewsDetailScreen slug={slug} />
    </View>
  );
}
