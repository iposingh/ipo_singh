import type { QuotaPolicy } from "../../config/quota.ts";
import type { IpoGuruConfig } from "../../config/ipoguru.ts";
import type { CounterStore } from "../../cache/store.ts";
import type { Logger } from "../../shared/logger.ts";
import { createQuotaGate, ProviderOutageError, QuotaExhaustedError, type QuotaGate } from "../quota.ts";
import { readAccount, readEnvelope, type IpoGuruAccount } from "./envelope.ts";
import { createHttpsTransport, IpoGuruTransportError, type IpoGuruTransport } from "./transport.ts";

export class IpoGuruDisabledError extends Error {
  constructor() {
    super("IPO Guru is disabled.");
    this.name = "IpoGuruDisabledError";
  }
}

export class IpoGuruRequestError extends Error {
  readonly httpStatus: number;
  readonly vendorCode: string | null;
  readonly retryable: boolean;
  readonly outage: boolean;
  readonly retryAfterMs: number | null;

  constructor(input: {
    httpStatus: number;
    vendorCode?: string | null;
    retryable: boolean;
    outage: boolean;
    retryAfterMs?: number | null;
  }) {
    super("IPO Guru request failed");
    this.name = "IpoGuruRequestError";
    this.httpStatus = input.httpStatus;
    this.vendorCode = input.vendorCode ?? null;
    this.retryable = input.retryable;
    this.outage = input.outage;
    this.retryAfterMs = input.retryAfterMs ?? null;
  }
}

export type IpoGuruVendorQuota = {
  plan: string | null;
  limit: number | null;
  remaining: number | null;
};

export type IpoGuruFailure = {
  httpStatus: number;
  code: string | null;
  observedAt: string;
};

export type IpoGuruAccountSnapshot = IpoGuruAccount & {
  observedAt: string;
};

export type IpoGuruMonitor = {
  enabled: boolean;
  minuteBudget: number | null;
  dailyBudget: number | null;
  minuteUsed: number | null;
  dayUsed: number | null;
  vendor: IpoGuruVendorQuota;
  account: IpoGuruAccountSnapshot | null;
  lastFailure: IpoGuruFailure | null;
};

export type IpoGuruListQuery = {
  type?: "mainboard" | "sme";
  status?: "open" | "upcoming" | "closed" | "listed";
  search?: string;
  /** `0` asks the vendor for no date window. Omit it when `search` is set. */
  months?: number;
  limit?: number;
};

export type IpoGuruGmpQuery = {
  type?: "mainboard" | "sme";
  /** Only `open` and `upcoming` are documented. Any other status is a 422. */
  status?: "open" | "upcoming";
};

export type IpoGuruClient = {
  readAccount: () => Promise<IpoGuruAccountSnapshot>;
  listIssues: (query?: IpoGuruListQuery) => Promise<unknown[]>;
  /** Current GMP for open and upcoming issues. One collection request, not one request per IPO. */
  listCurrentGmp: (query?: IpoGuruGmpQuery) => Promise<unknown[]>;
  /** One issue's GMP history. `trend` is daily. Pro adds `timeline`. `days` is not sent. */
  readGmpHistory: (slug: string) => Promise<unknown>;
  /** One issue's live subscription. Standard scope. No query. */
  readSubscription: (slug: string) => Promise<unknown>;
  /** One issue's day-wise subscription history. Pro scope. No query. */
  readSubscriptionHistory: (slug: string) => Promise<unknown>;
    /** One issue document. Path slug only. Company blocks need `details_full`. */
    readIssue: (slug: string) => Promise<unknown>;
    /** One current GMP. The collection `GET /gmp` is the routine poll. */
    readCurrentGmp: (slug: string) => Promise<unknown>;
    /** Anchor allocations. Empty before the book is published. */
    readAnchors: (slug: string) => Promise<unknown>;
    /** Offer-for-sale directory. Not an IPO catalogue. */
    listOfs: (query?: { limit?: number }) => Promise<unknown[]>;
    readOfs: (slug: string) => Promise<unknown>;
    /** Unlisted or pre-IPO quotes. Not exchange-traded prices. */
    listUnlisted: (query?: { search?: string }) => Promise<unknown[]>;
    readUnlisted: (slug: string, query?: { days?: number }) => Promise<unknown>;
    monitor: () => Promise<IpoGuruMonitor>;
};

type ClientOptions = {
  settings: IpoGuruConfig;
  quotaPolicy: QuotaPolicy;
  logger: Logger;
  counters?: CounterStore;
  transport?: IpoGuruTransport;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

const emptyVendor: IpoGuruVendorQuota = { plan: null, limit: null, remaining: null };

export function disabledIpoGuruMonitor(): IpoGuruMonitor {
  return {
    enabled: false,
    minuteBudget: null,
    dailyBudget: null,
    minuteUsed: null,
    dayUsed: null,
    vendor: emptyVendor,
    account: null,
    lastFailure: null,
  };
}

function headerNumber(headers: Readonly<Record<string, string>>, name: string): number | null {
  const raw = headers[name];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function retryAfterMs(headers: Readonly<Record<string, string>>, bodySeconds: number | null, now: Date): number | null {
  const header = headers["retry-after"];
  if (header && /^\d+$/.test(header)) return Number(header) * 1_000;
  if (header) {
    const at = Date.parse(header);
    if (!Number.isNaN(at)) return Math.max(0, at - now.getTime());
  }
  if (bodySeconds !== null) return Math.round(bodySeconds * 1_000);
  return null;
}

function containsSecret(value: unknown, secret: string): boolean {
  try {
    return JSON.stringify(value).includes(secret);
  } catch {
    return false;
  }
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new IpoGuruTransportError("response_timeout")), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export function createIpoGuruClient(options: ClientOptions): IpoGuruClient {
  const now = options.now ?? (() => new Date());
  const transport = options.transport ?? createHttpsTransport();
  const settings = options.settings;
  let vendor = emptyVendor;
  let account: IpoGuruAccountSnapshot | null = null;
  let lastFailure: IpoGuruFailure | null = null;

  const minuteBudget =
    settings.minuteBudget === null ? options.quotaPolicy.requestsPerMinute : Math.min(options.quotaPolicy.requestsPerMinute, settings.minuteBudget);
  const dailyBudget =
    settings.dailyBudget === null ? options.quotaPolicy.requestsPerDay : Math.min(options.quotaPolicy.requestsPerDay, settings.dailyBudget);
  const reserved = Math.min(options.quotaPolicy.reservedRequests, Math.max(0, dailyBudget - 1));
  const quota: QuotaGate = createQuotaGate({
    policy: {
      ...options.quotaPolicy,
      requestsPerMinute: minuteBudget,
      requestsPerDay: dailyBudget,
      reservedRequests: settings.enabled ? reserved : options.quotaPolicy.reservedRequests,
    },
    counters: options.counters,
    logger: options.logger,
    now,
    sleep: options.sleep,
    keyPrefix: "ipoguru:",
  });

  async function monitor(): Promise<IpoGuruMonitor> {
    if (!settings.enabled) return disabledIpoGuruMonitor();
    const used = await quota.snapshot();
    return {
      enabled: true,
      minuteBudget: settings.minuteBudget,
      dailyBudget: settings.dailyBudget,
      minuteUsed: used.minuteUsed,
      dayUsed: used.dayUsed,
      vendor,
      account,
      lastFailure,
    };
  }

  function rememberFailure(httpStatus: number, code: string | null): void {
    lastFailure = { httpStatus, code, observedAt: now().toISOString() };
  }

  function listParams(query: IpoGuruListQuery): URLSearchParams {
    const params = new URLSearchParams();
    if (query.type) params.set("type", query.type);
    if (query.status) params.set("status", query.status);
    if (query.search) params.set("search", query.search);
    if (query.months !== undefined) params.set("months", String(query.months));
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    return params;
  }

  function rejectListQuery(query: IpoGuruListQuery): boolean {
    if (query.type !== undefined && query.type !== "mainboard" && query.type !== "sme") return true;
    if (query.status !== undefined && query.status !== "open" && query.status !== "upcoming" && query.status !== "closed" && query.status !== "listed") {
      return true;
    }
    if (query.search !== undefined && (query.search.length === 0 || query.search.length > 80 || query.search.includes("<") || query.search.includes(">"))) {
      return true;
    }
    if (query.months !== undefined && (!Number.isInteger(query.months) || query.months < 0 || query.months > 240)) return true;
    if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 5_000)) return true;
    if (query.search !== undefined && query.months !== undefined) return true;
    return false;
  }

  function gmpParams(query: IpoGuruGmpQuery): URLSearchParams {
    const params = new URLSearchParams();
    if (query.type) params.set("type", query.type);
    if (query.status) params.set("status", query.status);
    return params;
  }

  function rejectGmpQuery(query: IpoGuruGmpQuery): boolean {
    if (query.type !== undefined && query.type !== "mainboard" && query.type !== "sme") return true;
    if (query.status !== undefined && query.status !== "open" && query.status !== "upcoming") return true;
    return false;
  }

  async function send(apiKey: string, path: string, query: URLSearchParams): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const expectedPath = expectedApiPath(path);
    const url = new URL(path.replace(/^\//, ""), `${settings.baseUrl}/`);
    if (!expectedPath || [...query.keys()].some((key) => !["type", "status", "search", "months", "limit", "days"].includes(key))) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    if ((path === "/ipos" || path === "/gmp" || path === "/ofs" || path === "/unlisted" || path.startsWith("/unlisted/")) && query.size > 0) {
      url.search = query.toString();
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== settings.hostname ||
      url.pathname !== expectedPath ||
      url.username !== "" ||
      (path === "/me" && url.search !== "")
    ) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const started = now().getTime();
    let response: Awaited<ReturnType<IpoGuruTransport>>;
    try {
      response = await withDeadline(
        transport({
          url: url.toString(),
          hostname: settings.hostname,
          headers: {
            accept: "application/json",
            "X-API-KEY": apiKey,
          },
          connectTimeoutMs: settings.connectTimeoutMs,
          responseTimeoutMs: settings.responseTimeoutMs,
        }),
        settings.connectTimeoutMs + settings.responseTimeoutMs,
      );
    } catch (error) {
      const reason = error instanceof IpoGuruTransportError ? error.reason : "network";
      const retryable = reason === "connect_timeout" || reason === "response_timeout" || reason === "network";
      options.logger.warn("IPO Guru request failed", {
        path,
        durationMs: Math.max(0, now().getTime() - started),
        reason,
      });
      rememberFailure(0, reason);
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: reason, retryable, outage: retryable });
    }

    vendor = {
      plan: response.headers["x-plan"] && /^[a-z0-9_-]{1,40}$/.test(response.headers["x-plan"]) ? response.headers["x-plan"] : vendor.plan,
      limit: headerNumber(response.headers, "x-ratelimit-limit") ?? vendor.limit,
      remaining: headerNumber(response.headers, "x-ratelimit-remaining") ?? vendor.remaining,
    };
    options.logger.info("IPO Guru response", {
      path,
      status: response.status,
      durationMs: Math.max(0, now().getTime() - started),
      plan: vendor.plan,
      rateLimitRemaining: vendor.remaining,
    });

    if (response.status === 429) {
      const envelope = readEnvelope(response.body);
      const code = envelope.kind === "failure" ? envelope.code : null;
      const wait = retryAfterMs(response.headers, envelope.kind === "failure" ? envelope.retryAfterSeconds : null, now());
      const daily = code === "daily_quota_reached";
      const retryable = !daily && code !== "plan_upgrade_required" && wait !== null && wait <= options.quotaPolicy.backoffMaxMs;
      rememberFailure(429, code ?? "rate_limited");
      throw new IpoGuruRequestError({
        httpStatus: 429,
        vendorCode: code ?? "rate_limited",
        retryable,
        outage: false,
        retryAfterMs: wait,
      });
    }

    if (response.status >= 500) {
      rememberFailure(response.status, "upstream");
      throw new IpoGuruRequestError({ httpStatus: response.status, vendorCode: "upstream", retryable: true, outage: true });
    }

    if (response.status !== 200) {
      const envelope = readEnvelope(response.body);
      const code = envelope.kind === "failure" ? envelope.code : null;
      rememberFailure(response.status, code);
      throw new IpoGuruRequestError({ httpStatus: response.status, vendorCode: code, retryable: false, outage: false });
    }
    if (containsSecret(response.body, apiKey)) {
      rememberFailure(200, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: "malformed", retryable: false, outage: false });
    }
    return response;
  }

  async function once(apiKey: string): Promise<IpoGuruAccountSnapshot> {
    const response = await send(apiKey, "/me", new URLSearchParams());
    const envelope = readEnvelope(response.body);
    if (envelope.kind === "empty") {
      rememberFailure(200, "empty");
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: "empty", retryable: false, outage: false });
    }
    if (envelope.kind !== "data") {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: "malformed", retryable: false, outage: false });
    }
    const parsed = readAccount(envelope.data);
    if (!parsed) {
      rememberFailure(200, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: "malformed", retryable: false, outage: false });
    }
    account = { ...parsed, observedAt: now().toISOString() };
    lastFailure = null;
    return account;
  }

  async function listOnce(apiKey: string, query: IpoGuruListQuery): Promise<unknown[]> {
    if (rejectListQuery(query)) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const response = await send(apiKey, "/ipos", listParams(query));
    const envelope = readEnvelope(response.body);
    if (envelope.kind === "empty") {
      lastFailure = null;
      return [];
    }
    if (envelope.kind !== "data" || !Array.isArray(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: "malformed", retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  async function gmpOnce(apiKey: string, query: IpoGuruGmpQuery): Promise<unknown[]> {
    if (rejectGmpQuery(query)) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const response = await send(apiKey, "/gmp", gmpParams(query));
    const envelope = readEnvelope(response.body);
    if (envelope.kind === "empty") {
      lastFailure = null;
      return [];
    }
    if (envelope.kind !== "data" || !Array.isArray(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: "malformed", retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  async function historyOnce(apiKey: string, slug: string): Promise<unknown> {
    const path = historyPath(slug);
    if (!path) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const response = await send(apiKey, path, new URLSearchParams());
    const envelope = readEnvelope(response.body);
    if (envelope.kind !== "data" || !isHistoryDocument(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: code, retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  async function issueOnce(apiKey: string, slug: string): Promise<unknown> {
    const path = slugPath("/ipos", slug);
    if (!path) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const response = await send(apiKey, path, new URLSearchParams());
    const envelope = readEnvelope(response.body);
    if (envelope.kind !== "data" || !isHistoryDocument(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: code, retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  async function subscriptionOnce(apiKey: string, slug: string, history: boolean): Promise<unknown> {
    const path = subscriptionPath(slug, history);
    if (!path) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const response = await send(apiKey, path, new URLSearchParams());
    const envelope = readEnvelope(response.body);
    if (envelope.kind !== "data" || !isHistoryDocument(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: code, retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  async function run<T>(work: (apiKey: string) => Promise<T>): Promise<T> {
    if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
    const apiKey = settings.apiKey;
    try {
      return await quota.run(() => work(apiKey), {
        retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
        outage: (error) => error instanceof IpoGuruRequestError && error.outage,
        delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
      });
    } catch (error) {
      if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) throw error;
      rememberFailure(0, "network");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
    }
  }

  async function documentAt(apiKey: string, path: string | null, query = new URLSearchParams()): Promise<unknown> {
    if (!path) {
      rememberFailure(0, "malformed");
      throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
    }
    const response = await send(apiKey, path, query);
    const envelope = readEnvelope(response.body);
    if (envelope.kind !== "data" || !isHistoryDocument(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : envelope.kind === "empty" ? "empty" : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: code, retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  async function collectionAt(apiKey: string, path: string, query: URLSearchParams): Promise<unknown[]> {
    const response = await send(apiKey, path, query);
    const envelope = readEnvelope(response.body);
    if (envelope.kind === "empty") {
      lastFailure = null;
      return [];
    }
    if (envelope.kind !== "data" || !Array.isArray(envelope.data)) {
      const code = envelope.kind === "failure" ? envelope.code : "malformed";
      rememberFailure(200, code);
      throw new IpoGuruRequestError({ httpStatus: 200, vendorCode: code, retryable: false, outage: false });
    }
    lastFailure = null;
    return envelope.data;
  }

  return {
    monitor,
    async readAccount() {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => once(apiKey), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async listIssues(query = {}) {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => listOnce(apiKey, query), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async listCurrentGmp(query = {}) {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => gmpOnce(apiKey, query), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async readGmpHistory(slug: string) {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => historyOnce(apiKey, slug), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async readSubscription(slug: string) {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => subscriptionOnce(apiKey, slug, false), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async readIssue(slug: string) {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => issueOnce(apiKey, slug), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async readSubscriptionHistory(slug: string) {
      if (!settings.enabled || !settings.apiKey) throw new IpoGuruDisabledError();
      const apiKey = settings.apiKey;
      try {
        return await quota.run(() => subscriptionOnce(apiKey, slug, true), {
          retryable: (error) => error instanceof IpoGuruRequestError && error.retryable,
          outage: (error) => error instanceof IpoGuruRequestError && error.outage,
          delayMs: (error) => (error instanceof IpoGuruRequestError && error.retryAfterMs !== null ? error.retryAfterMs : Number.NaN),
        });
      } catch (error) {
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError || error instanceof IpoGuruRequestError) {
          throw error;
        }
        rememberFailure(0, "network");
        throw new IpoGuruRequestError({ httpStatus: 0, vendorCode: "network", retryable: false, outage: true });
      }
    },
    async readCurrentGmp(slug: string) {
      const path = slugPath("/ipos", slug, "/gmp");
      if (!path) throw malformed();
      return run((apiKey) => documentAt(apiKey, path));
    },
    async readAnchors(slug: string) {
      const path = slugPath("/ipos", slug, "/anchors");
      if (!path) throw malformed();
      return run((apiKey) => documentAt(apiKey, path));
    },
    async listOfs(query: { limit?: number } = {}) {
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 500)) throw malformed();
      const params = new URLSearchParams();
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      return run((apiKey) => collectionAt(apiKey, "/ofs", params));
    },
    async readOfs(slug: string) {
      const path = slugPath("/ofs", slug);
      if (!path) throw malformed();
      return run((apiKey) => documentAt(apiKey, path));
    },
    async listUnlisted(query: { search?: string } = {}) {
      if (query.search !== undefined && (query.search.length === 0 || query.search.length > 80)) throw malformed();
      const params = new URLSearchParams();
      if (query.search) params.set("search", query.search);
      return run((apiKey) => collectionAt(apiKey, "/unlisted", params));
    },
    async readUnlisted(slug: string, query: { days?: number } = {}) {
      if (query.days !== undefined && (!Number.isInteger(query.days) || query.days < 1 || query.days > 400)) throw malformed();
      const path = slugPath("/unlisted", slug);
      if (!path) throw malformed();
      const params = new URLSearchParams();
      if (query.days !== undefined) params.set("days", String(query.days));
      return run((apiKey) => documentAt(apiKey, path, params));
    },
  };
}

function malformed(): IpoGuruRequestError {
  return new IpoGuruRequestError({ httpStatus: 0, vendorCode: "malformed", retryable: false, outage: false });
}

function slugPath(prefix: "/ipos" | "/ofs" | "/unlisted", slug: string, suffix = ""): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const path = `${prefix}/${slug}${suffix}`;
  return path.length <= 120 ? path : null;
}

function subscriptionPath(slug: string, history: boolean): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  return history ? `/ipos/${slug}/subscription/history` : `/ipos/${slug}/subscription`;
}

function historyPath(slug: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  return `/ipos/${slug}/gmp/history`;
}

function expectedApiPath(path: string): string | null {
  if (path === "/me") return "/api/v2/me";
  if (path === "/ipos") return "/api/v2/ipos";
  if (path === "/gmp") return "/api/v2/gmp";
  if (path === "/ofs") return "/api/v2/ofs";
  if (path === "/unlisted") return "/api/v2/unlisted";
  if (/^\/ipos\/[a-z0-9]+(?:-[a-z0-9]+)*\/gmp\/history$/.test(path) && path.length <= 110) return `/api/v2${path}`;
  if (/^\/ipos\/[a-z0-9]+(?:-[a-z0-9]+)*\/gmp$/.test(path) && path.length <= 100) return `/api/v2${path}`;
  if (/^\/ipos\/[a-z0-9]+(?:-[a-z0-9]+)*\/subscription\/history$/.test(path) && path.length <= 120) return `/api/v2${path}`;
  if (/^\/ipos\/[a-z0-9]+(?:-[a-z0-9]+)*\/subscription$/.test(path) && path.length <= 110) return `/api/v2${path}`;
  if (/^\/ipos\/[a-z0-9]+(?:-[a-z0-9]+)*\/anchors$/.test(path) && path.length <= 100) return `/api/v2${path}`;
  if (/^\/ofs\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && path.length <= 90) return `/api/v2${path}`;
  if (/^\/unlisted\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && path.length <= 100) return `/api/v2${path}`;
  if (/^\/ipos\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && path.length <= 90) return `/api/v2${path}`;
  return null;
}

function isHistoryDocument(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
