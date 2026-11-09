import { Redirect } from "expo-router";

/** Legacy stack notifications route. Preferences live under Settings; tab bar uses News. */
export default function NotificationsRedirect() {
  return <Redirect href="/(tabs)/notifications" />;
}
