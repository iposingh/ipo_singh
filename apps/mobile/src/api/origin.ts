export type AppEnvironment = "development" | "preview" | "production";

export type OriginFailure = "missing" | "invalid" | "vendor" | "local" | "device-local" | "ephemeral";

export type OriginResult = { ok: true; origin: string } | { ok: false; failure: OriginFailure };

export type ResolveApiOriginOptions = {
  /**
   * True on a physical phone or tablet. Simulators/emulators stay false so the
   * development loopback default remains usable on this computer.
   */
  isPhysicalDevice?: boolean;
};

/** Used only when the development environment leaves the origin unset and the runtime is not a physical device. */
export const developmentApiOrigin = "http://127.0.0.1:4000";

/**
 * Android Emulator loopback to the host machine. Set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN to this
 * when the emulator cannot reach 127.0.0.1 on the host (common on Android AVD).
 */
export const androidEmulatorApiOrigin = "http://10.0.2.2:4000";

const environments = new Set<AppEnvironment>(["development", "preview", "production"]);

export function readAppEnvironment(value: string | undefined, developmentFallback: boolean): AppEnvironment {
  if (value && environments.has(value as AppEnvironment)) return value as AppEnvironment;
  return developmentFallback ? "development" : "production";
}

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".localhost");
}

function isVendorHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "ipoguru.in" || host.endsWith(".ipoguru.in");
}

/**
 * Ephemeral public tunnels (for example a temporary Cloudflare quick tunnel) must never
 * become the preview or production API origin. Development may still point at a tunnel
 * for a short physical-device smoke test.
 */
export function isEphemeralTunnelHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith(".trycloudflare.com") ||
    host.endsWith(".cfargotunnel.com") ||
    host.endsWith(".loca.lt") ||
    host.endsWith(".ngrok.io") ||
    host.endsWith(".ngrok-free.app") ||
    host.endsWith(".ngrok.app") ||
    host.endsWith(".serveo.net")
  );
}

/**
 * Resolves the IPO Singh API origin. Preview and production never fall back to a local address.
 * A physical device never uses loopback (localhost / 127.0.0.1); set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN
 * to this computer's LAN address for device development.
 */
export function resolveApiOrigin(
  appEnv: AppEnvironment,
  configured: string | undefined,
  options: ResolveApiOriginOptions = {},
): OriginResult {
  const trimmed = configured?.trim() ?? "";
  const physical = options.isPhysicalDevice === true;
  const value = trimmed || (appEnv === "development" && !physical ? developmentApiOrigin : "");
  if (!value) return { ok: false, failure: physical && appEnv === "development" ? "device-local" : "missing" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, failure: "invalid" };
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username !== "" || url.password !== "") {
    return { ok: false, failure: "invalid" };
  }
  if (url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) {
    return { ok: false, failure: "invalid" };
  }
  if (isVendorHost(url.hostname)) return { ok: false, failure: "vendor" };
  if (physical && isLocalHost(url.hostname)) return { ok: false, failure: "device-local" };
  if (appEnv !== "development") {
    if (isLocalHost(url.hostname)) return { ok: false, failure: "local" };
    if (url.protocol !== "https:") return { ok: false, failure: "invalid" };
    if (isEphemeralTunnelHost(url.hostname)) return { ok: false, failure: "ephemeral" };
  }
  return { ok: true, origin: url.origin };
}
