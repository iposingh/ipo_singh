import { AppHeader } from "../../src/components/app-header";
import { NewsListScreen } from "../../src/screens/news-list-screen";
import { View } from "react-native";
import { useTheme } from "../../src/theme/provider";

export default function NewsIndexRoute() {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <AppHeader title="News & Guides" showSearch={false} />
      <NewsListScreen />
    </View>
  );
}
