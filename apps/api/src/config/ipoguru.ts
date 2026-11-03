import { ConfigError } from "../shared/errors.ts";

const officialBaseUrl = "https://www.ipoguru.in/api/v2";
const officialHostname = "www.ipoguru.in";
const keyPattern = /^[\x21-\x7E]{16,256}$/;

export type IpoGuruConfig = {
  enabled: boolean;
  baseUrl: string;
  hostname: string;
  minuteBudget: number | null;
  dailyBudget: number | null;
  connectTimeoutMs: number;
  responseTimeoutMs: number;
  /** Public catalogue stays available until this is set false after the subscription ends. */
  display: boolean;
  /** Absent from JSON serialization. */
  apiKey: string | null;
};

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sealApiKey(config: Omit<IpoGuruConfig, "apiKey">, apiKey: string | null): IpoGuruConfig {
  const sealed = config as IpoGuruConfig;
  Object.defineProperty(sealed, "apiKey", { enumerable: false, writable: false, value: apiKey });
  return sealed;
}

/** Stored IPO Guru rows stay on public pages until display is turned off for an ipo-guru primary. */
export function ipoGuruCatalogueVisible(input: {
  provider: { primary: string } | null;
  ipoGuru: { display: boolean };
}): boolean {
  if (!input.provider || input.provider.primary !== "ipo-guru") return true;
  return input.ipoGuru.display;
}

export function disabledIpoGuruConfig(): IpoGuruConfig {
  return sealApiKey(
    {
      enabled: false,
      baseUrl: officialBaseUrl,
      hostname: officialHostname,
      minuteBudget: null,
      dailyBudget: null,
      connectTimeoutMs: 5_000,
      responseTimeoutMs: 8_000,
      display: true,
    },
    null,
  );
}

function readFlag(value: string | undefined): boolean {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(["IPOGURU_ENABLED"]);
}

function readDisplay(value: string | undefined): boolean {
  if (!value) return true;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(["IPOGURU_DISPLAY"]);
}

function readBaseUrl(value: string | undefined): string {
  const raw = value ?? officialBaseUrl;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(["IPOGURU_BASE_URL"]);
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== officialHostname ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    path !== "/api/v2"
  ) {
    throw new ConfigError(["IPOGURU_BASE_URL"]);
  }
  return officialBaseUrl;
}

function readBudget(value: string | undefined, field: string, max: number): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new ConfigError([field]);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new ConfigError([field]);
  return parsed;
}

function readKey(value: string | undefined): string | null {
  if (!value) return null;
  if (!keyPattern.test(value) || value.includes("\\") || /[\r\n]/.test(value)) {
    throw new ConfigError(["IPOGURU_API_KEY"]);
  }
  return value;
}

function rejectPublicSecret(env: Record<string, string | undefined>): void {
  const fields = Object.keys(env)
    .filter((key) => key.startsWith("NEXT_PUBLIC_") && /ipoguru|api[_-]?key/i.test(key))
    .sort();
  if (fields.length > 0) throw new ConfigError(fields);
}

function readResponseTimeout(env: Record<string, string | undefined>): number {
  const raw = blankToUndefined(env.IPO_DATA_TIMEOUT_MS);
  if (!raw) return 8_000;
  if (!/^\d+$/.test(raw)) throw new ConfigError(["IPO_DATA_TIMEOUT_MS"]);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 60_000) throw new ConfigError(["IPO_DATA_TIMEOUT_MS"]);
  return parsed;
}

/**
 * Application request ceilings capped by configured IPO Guru budgets when enabled.
 * Prevents the sync/admin UI from advertising a higher limit than the vendor gate will allow.
 */
export function effectiveIpoGuruRequestLimits(input: {
  enabled: boolean;
  minuteBudget: number | null;
  dailyBudget: number | null;
  requestsPerMinute: number;
  requestsPerDay: number;
  reservedRequests: number;
}): { requestsPerMinute: number; requestsPerDay: number; reservedRequests: number } {
  const requestsPerMinute =
    input.enabled && input.minuteBudget !== null
      ? Math.min(input.requestsPerMinute, input.minuteBudget)
      : input.requestsPerMinute;
  const requestsPerDay =
    input.enabled && input.dailyBudget !== null
      ? Math.min(input.requestsPerDay, input.dailyBudget)
      : input.requestsPerDay;
  const reservedRequests = Math.min(input.reservedRequests, Math.max(0, requestsPerDay - 1));
  return { requestsPerMinute, requestsPerDay, reservedRequests };
}

/**
 * Backend IPO Guru settings. The client stays disabled until IPOGURU_ENABLED=true.
 * The key is never read from a NEXT_PUBLIC variable.
 */
export function readIpoGuruConfig(env: Record<string, string | undefined>): IpoGuruConfig {
  rejectPublicSecret(env);
  const responseTimeoutMs = readResponseTimeout(env);
  const enabled = readFlag(blankToUndefined(env.IPOGURU_ENABLED));
  const display = readDisplay(blankToUndefined(env.IPOGURU_DISPLAY));
  const baseUrl = readBaseUrl(blankToUndefined(env.IPOGURU_BASE_URL));
  const minuteBudget = readBudget(blankToUndefined(env.IPOGURU_MINUTE_BUDGET), "IPOGURU_MINUTE_BUDGET", 10_000);
  const dailyBudget = readBudget(blankToUndefined(env.IPOGURU_DAILY_BUDGET), "IPOGURU_DAILY_BUDGET", 1_000_000);
  const apiKey = readKey(blankToUndefined(env.IPOGURU_API_KEY));
  if (minuteBudget !== null && dailyBudget !== null && dailyBudget < minuteBudget) {
    throw new ConfigError(["IPOGURU_DAILY_BUDGET"]);
  }
  if (enabled && !apiKey) throw new ConfigError(["IPOGURU_API_KEY"]);
  if (enabled && (minuteBudget === null || dailyBudget === null)) {
    throw new ConfigError([
      ...(minuteBudget === null ? ["IPOGURU_MINUTE_BUDGET"] : []),
      ...(dailyBudget === null ? ["IPOGURU_DAILY_BUDGET"] : []),
    ]);
  }
  const connectTimeoutMs = Math.min(5_000, responseTimeoutMs);
  return sealApiKey(
    {
      enabled,
      baseUrl,
      hostname: officialHostname,
      minuteBudget,
      dailyBudget,
      connectTimeoutMs,
      responseTimeoutMs,
      display,
    },
    apiKey,
  );
}
