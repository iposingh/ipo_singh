import { router, Stack } from "expo-router";
import { AppHeader } from "../src/components/app-header";
import { AppText } from "../src/components/app-text";
import { PrimaryButton } from "../src/components/primary-button";
import { ScreenContainer } from "../src/components/screen-container";

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: true, header: () => <AppHeader title="Not found" showSearch={false} /> }} />
      <ScreenContainer safeBottom>
        <AppText weight="semibold" size="lg">
          This screen is not in the app.
        </AppText>
        <PrimaryButton label="Back to Home" onPress={() => router.replace("/")} />
      </ScreenContainer>
    </>
  );
}
