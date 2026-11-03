import { Redirect } from "expo-router";

/** Legacy Account tab path. Settings is the primary destination. */
export default function AccountRedirect() {
  return <Redirect href="/(tabs)/settings" />;
}
