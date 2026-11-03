import { Redirect } from "expo-router";

/** Legacy stack notifications route. Alerts tab owns the inbox. */
export default function NotificationsRedirect() {
  return <Redirect href="/(tabs)/notifications" />;
}
