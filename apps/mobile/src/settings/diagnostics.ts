import type { AppEnvironment } from "../api/origin.ts";

/**
 * Developer diagnostics (API connectivity) stay hidden until revealed.
 * Production store builds never expose this surface — long-press is ignored.
 */
export const diagnosticsRevealHint = "Long-press the app version to show developer diagnostics.";

/** Production Play builds must not expose connectivity diagnostics as a public debug menu. */
export function diagnosticsAvailable(appEnv: AppEnvironment): boolean {
  return appEnv !== "production";
}

export function nextDiagnosticsVisible(current: boolean, force?: boolean): boolean {
  if (force === true) return true;
  if (force === false) return false;
  return !current;
}

export function diagnosticsSectionTitle(): string {
  return "Developer diagnostics";
}

export function diagnosticsSectionDescription(): string {
  return "API connectivity for support. Hidden from everyday Settings and unavailable in production builds.";
}
