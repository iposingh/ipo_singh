export type MobileApiErrorKind = "timeout" | "cancelled" | "network" | "http" | "malformed" | "configuration";

export class MobileApiError extends Error {
  readonly kind: MobileApiErrorKind;
  readonly status: number | null;

  constructor(kind: MobileApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "MobileApiError";
    this.kind = kind;
    this.status = status;
  }
}

export const apiFailureMessage = {
  missing: "Set the IPO Singh API address for this build.",
  invalid: "The IPO Singh API address is not valid.",
  vendor: "The app cannot use the data vendor address.",
  local: "This build needs the public IPO Singh API address.",
  ephemeral:
    "Preview and production cannot use a temporary tunnel address. Set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN to a stable HTTPS IPO Singh API host.",
  "device-local":
    "This phone cannot reach localhost. Set EXPO_PUBLIC_IPO_SINGH_API_ORIGIN to this computer's LAN address, for example http://192.168.1.20:4000.",
  offline: "This device is offline.",
  timeout: "The IPO Singh API did not respond in time.",
  network: "The IPO Singh API could not be reached.",
  http: "The IPO Singh API is unavailable.",
  malformed: "The IPO Singh API returned an unexpected response.",
} as const;
