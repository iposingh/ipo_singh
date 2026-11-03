import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppHeader } from "../src/components/app-header";
import { AuthProvider } from "../src/auth/provider";
import { CompareProvider } from "../src/discovery/compare-selection";
import { NotificationProvider } from "../src/notifications/provider";
import { PushNotificationRuntime } from "../src/notifications/push-runtime";
import { WatchlistProvider } from "../src/watchlist/provider";
import { NetworkProvider } from "../src/network/provider";
import { ThemeProvider, useTheme } from "../src/theme/provider";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colorScheme, palette } = useTheme();

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="ipo/[slug]"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="search"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="compare"
          options={{
            headerShown: true,
            title: "Compare",
            header: () => <AppHeader title="Compare" showSearch={false} />,
          }}
        />
        <Stack.Screen
          name="allotment"
          options={{
            headerShown: true,
            title: "Allotment",
            header: () => <AppHeader title="Allotment" showSearch={false} />,
          }}
        />
        <Stack.Screen
          name="news/index"
          options={{
            headerShown: false,
            title: "News & Guides",
          }}
        />
        <Stack.Screen
          name="news/[slug]"
          options={{
            headerShown: false,
            title: "Article",
          }}
        />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NetworkProvider>
          <AuthProvider>
            <NotificationProvider>
              <PushNotificationRuntime />
              <WatchlistProvider>
                <CompareProvider>
                  <RootNavigator />
                </CompareProvider>
              </WatchlistProvider>
            </NotificationProvider>
          </AuthProvider>
        </NetworkProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
