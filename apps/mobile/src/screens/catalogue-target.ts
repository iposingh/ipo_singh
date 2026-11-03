import * as Device from "expo-device";
import * as Network from "expo-network";
import { apiFailureMessage } from "../api/errors";
import { readAppEnvironment, resolveApiOrigin } from "../api/origin";
import { isDeviceOffline, publishConnectivity, readPublishedConnectivity } from "../network/connectivity";

export async function readCatalogueTarget(): Promise<{ origin: string; offline: boolean } | { error: string }> {
  const appEnv = readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV, __DEV__);
  const origin = resolveApiOrigin(appEnv, process.env.EXPO_PUBLIC_IPO_SINGH_API_ORIGIN, {
    isPhysicalDevice: Device.isDevice,
  });
  if (!origin.ok) return { error: apiFailureMessage[origin.failure] };

  const published = readPublishedConnectivity();
  if (published) {
    return { origin: origin.origin, offline: published.offline };
  }

  try {
    const network = await Network.getNetworkStateAsync();
    const offline = isDeviceOffline(network);
    publishConnectivity(offline);
    return { origin: origin.origin, offline };
  } catch {
    // Fail open for catalogue reads so a sensor error does not block cached browsing.
    publishConnectivity(false);
    return { origin: origin.origin, offline: false };
  }
}
