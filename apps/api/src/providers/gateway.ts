import {
  ipoSchema,
  type FinancialPeriod,
  type GmpHistory,
  type GmpSnapshot,
  type Ipo,
  type IpoListQuery,
  type IpoSummary,
  type ListingPerformance,
  type Provenance,
  type Registrar,
  type SubscriptionHistory,
  type SubscriptionSnapshot,
} from "@ipo-singh/contracts";
import type { ProviderFeature } from "./capabilities.ts";
import { ProviderError, ProviderNotConnectedError, ProviderPayloadError, ProviderTimeoutError, ProviderUnsupportedError } from "./errors.ts";
import {
  assertObservationFreshness,
  normalizeIpoId,
  normalizeListQuery,
  normalizeProviderPayload,
  normalizeProviderSource,
  provenanceFor,
  type NormalizedFeatureValue,
} from "./normalize.ts";
import type { AdapterResult, IpoDataProvider, ProviderKey, ProviderSource } from "./provider.ts";

export type ProviderRead<T> = {
  value: T;
  provenance: Provenance;
  providerKey: ProviderKey;
  feature: ProviderFeature;
  lastSuccessfulFetchAt: string;
};

export type ProviderGateway = {
  listIpos(query?: IpoListQuery): Promise<ProviderRead<IpoSummary[]> & { records?: readonly Ipo[] }>;
  getIpoDetails(ipoId: string): Promise<ProviderRead<Ipo>>;
  getCurrentGmp(ipoId: string): Promise<ProviderRead<GmpSnapshot>>;
  getGmpHistory(ipoId: string): Promise<ProviderRead<GmpHistory>>;
  getIntradayGmp(ipoId: string): Promise<ProviderRead<GmpHistory>>;
  getCurrentSubscription(ipoId: string): Promise<ProviderRead<SubscriptionSnapshot>>;
  getSubscriptionHistory(ipoId: string): Promise<ProviderRead<SubscriptionHistory>>;
  getCompanyFinancials(ipoId: string): Promise<ProviderRead<FinancialPeriod[]>>;
  getRegistrarDetails(ipoId: string): Promise<ProviderRead<Registrar>>;
  getListingInformation(ipoId: string): Promise<ProviderRead<ListingPerformance>>;
  lastSuccessfulFetch(providerKey: ProviderKey, feature: ProviderFeature): string | null;
};

type GatewayOptions = {
  primary: IpoDataProvider;
  fallback?: IpoDataProvider | null;
  now?: () => Date;
  timeoutMs?: number;
  scheduleTimeout?: (ms: number, onFire: () => void) => () => void;
};

function catalogRecords(result: AdapterResult, providerKey: string): readonly Ipo[] | undefined {
  if (!Object.hasOwn(result, "records")) return undefined;
  const parsed = ipoSchema.array().safeParse(result.records);
  if (!parsed.success) throw new ProviderPayloadError(providerKey, "listIpos", ["records"]);
  return parsed.data;
}

function defaultSchedule(ms: number, onFire: () => void): () => void {
  const timer = setTimeout(onFire, ms);
  return () => clearTimeout(timer);
}

export function createProviderGateway(options: GatewayOptions): ProviderGateway {
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 8_000;
  const scheduleTimeout = options.scheduleTimeout ?? defaultSchedule;
  const fallback = options.fallback ?? null;
  const successes = new Map<string, string>();

  function remember(providerKey: ProviderKey, feature: ProviderFeature, at: Date): string {
    const stamp = at.toISOString();
    successes.set(`${providerKey}:${feature}`, stamp);
    return stamp;
  }

  async function withTimeout<T>(provider: IpoDataProvider, feature: ProviderFeature, start: () => Promise<T>): Promise<T> {
    const work = start();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const cancel = scheduleTimeout(timeoutMs, () => {
        if (settled) return;
        settled = true;
        reject(new ProviderTimeoutError(provider.key, feature));
      });
      work.then(
        (value) => {
          if (settled) return;
          settled = true;
          cancel();
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cancel();
          reject(error);
        },
      );
    });
  }

  async function readFrom<Feature extends ProviderFeature>(
    provider: IpoDataProvider,
    feature: Feature,
    load: (provider: IpoDataProvider) => Promise<AdapterResult>,
    check: (value: NormalizedFeatureValue<Feature>, providerKey: string, source: ProviderSource) => void,
  ): Promise<ProviderRead<NormalizedFeatureValue<Feature>> & { records?: readonly Ipo[] }> {
    const capability = provider.capabilities[feature];
    if (capability === "unsupported") throw new ProviderUnsupportedError(provider.key, feature);
    if (capability === "unverified") throw new ProviderNotConnectedError(provider.key, feature);
    const result = await withTimeout(provider, feature, () => load(provider));
    const source = normalizeProviderSource(result.source, provider.key, feature);
    const value = normalizeProviderPayload(feature, result.value, provider.key);
    check(value, provider.key, source);
    const records = feature === "listIpos" ? catalogRecords(result, provider.key) : undefined;
    const at = now();
    return {
      value,
      provenance: provenanceFor(source, at),
      providerKey: provider.key,
      feature,
      lastSuccessfulFetchAt: remember(provider.key, feature, at),
      ...(records !== undefined ? { records } : {}),
    };
  }

  async function read<Feature extends ProviderFeature>(
    feature: Feature,
    load: (provider: IpoDataProvider) => Promise<AdapterResult>,
    check: (value: NormalizedFeatureValue<Feature>, providerKey: string, source: ProviderSource) => void,
  ): Promise<ProviderRead<NormalizedFeatureValue<Feature>>> {
    try {
      return await readFrom(options.primary, feature, load, check);
    } catch (error) {
      if (!(error instanceof ProviderError) || !error.fallbackEligible || !fallback) throw error;
      if (fallback.capabilities[feature] !== "supported") throw error;
      return readFrom(fallback, feature, load, check);
    }
  }

  function requireId(ipoId: string, feature: ProviderFeature): string {
    return normalizeIpoId(ipoId, options.primary.key, feature);
  }

  function assertMatchingProvenance(
    actual: Provenance,
    source: ProviderSource,
    providerKey: string,
    feature: ProviderFeature,
  ): void {
    const expected = provenanceFor(source, now());
    const same =
      actual.sourceName === expected.sourceName &&
      actual.retrievedAt === expected.retrievedAt &&
      actual.freshness === expected.freshness;
    if (!same) throw new ProviderPayloadError(providerKey, feature, ["provenance"]);
  }

  return {
    listIpos(query = {}) {
      const parsed = normalizeListQuery(query, options.primary.key);
      return read("listIpos", (provider) => provider.listIpos(parsed), (rows, providerKey, source) => {
        for (const row of rows) assertMatchingProvenance(row.provenance, source, providerKey, "listIpos");
      });
    },
    getIpoDetails(ipoId) {
      const id = requireId(ipoId, "ipoDetails");
      return read("ipoDetails", (provider) => provider.getIpoDetails(id), (ipo, providerKey, source) => {
        if (ipo.id !== id) throw new ProviderPayloadError(providerKey, "ipoDetails", ["id"]);
        assertMatchingProvenance(ipo.provenance, source, providerKey, "ipoDetails");
        if (ipo.gmp) assertObservationFreshness(ipo.gmp.observedAt, ipo.gmp.freshness, now(), providerKey, "ipoDetails");
        if (ipo.subscription) {
          assertObservationFreshness(ipo.subscription.observedAt, ipo.subscription.freshness, now(), providerKey, "ipoDetails");
        }
      });
    },
    getCurrentGmp(ipoId) {
      const id = requireId(ipoId, "currentGmp");
      return read("currentGmp", (provider) => provider.getCurrentGmp(id), (gmp, providerKey) => {
        assertObservationFreshness(gmp.observedAt, gmp.freshness, now(), providerKey, "currentGmp");
      });
    },
    getGmpHistory(ipoId) {
      const id = requireId(ipoId, "gmpHistory");
      return read("gmpHistory", (provider) => provider.getGmpHistory(id), (history, providerKey) => {
        if (history.ipoId !== id) throw new ProviderPayloadError(providerKey, "gmpHistory", ["ipoId"]);
        if (history.observations.some((row) => row.session !== "daily")) {
          throw new ProviderPayloadError(providerKey, "gmpHistory", ["observations.session"]);
        }
      });
    },
    getIntradayGmp(ipoId) {
      const id = requireId(ipoId, "intradayGmp");
      return read("intradayGmp", (provider) => provider.getIntradayGmp(id), (history, providerKey) => {
        if (history.ipoId !== id) throw new ProviderPayloadError(providerKey, "intradayGmp", ["ipoId"]);
        if (history.observations.some((row) => row.session !== "intraday")) {
          throw new ProviderPayloadError(providerKey, "intradayGmp", ["observations.session"]);
        }
      });
    },
    getCurrentSubscription(ipoId) {
      const id = requireId(ipoId, "currentSubscription");
      return read("currentSubscription", (provider) => provider.getCurrentSubscription(id), (snapshot, providerKey) => {
        assertObservationFreshness(snapshot.observedAt, snapshot.freshness, now(), providerKey, "currentSubscription");
      });
    },
    getSubscriptionHistory(ipoId) {
      const id = requireId(ipoId, "subscriptionHistory");
      return read("subscriptionHistory", (provider) => provider.getSubscriptionHistory(id), (history, providerKey) => {
        if (history.ipoId !== id) throw new ProviderPayloadError(providerKey, "subscriptionHistory", ["ipoId"]);
        for (const row of history.observations) {
          assertObservationFreshness(row.observedAt, row.freshness, now(), providerKey, "subscriptionHistory");
        }
      });
    },
    getCompanyFinancials(ipoId) {
      const id = requireId(ipoId, "companyFinancials");
      return read("companyFinancials", (provider) => provider.getCompanyFinancials(id), () => undefined);
    },
    getRegistrarDetails(ipoId) {
      const id = requireId(ipoId, "registrarDetails");
      return read("registrarDetails", (provider) => provider.getRegistrarDetails(id), () => undefined);
    },
    getListingInformation(ipoId) {
      const id = requireId(ipoId, "listingInformation");
      return read("listingInformation", (provider) => provider.getListingInformation(id), () => undefined);
    },
    lastSuccessfulFetch(providerKey, feature) {
      return successes.get(`${providerKey}:${feature}`) ?? null;
    },
  };
}
