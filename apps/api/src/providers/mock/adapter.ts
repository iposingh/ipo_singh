import type { IpoListQuery } from "@ipo-singh/contracts";
import { capabilities, providerCapabilitiesSchema, type ProviderCapabilities, type ProviderFeature } from "../capabilities.ts";
import { ProviderTimeoutError, ProviderUnavailableError } from "../errors.ts";
import type { AdapterResult, IpoDataProvider } from "../provider.ts";
import {
  fixtureFinancials,
  fixtureGmp,
  fixtureGmpHistory,
  fixtureIpo,
  fixtureListing,
  fixtureRegistrar,
  fixtureSource,
  fixtureSourceName,
  fixtureSubscription,
  fixtureSubscriptionHistory,
  fixtureSummary,
} from "./fixtures.ts";

export type MockBehavior = "ok" | "hang" | "timeout" | "unavailable" | "malformed";

export type MockProviderOptions = {
  capabilities?: Partial<ProviderCapabilities>;
  behavior?: Partial<Record<ProviderFeature, MockBehavior>>;
  now?: () => Date;
  gmpAmountRupees?: number | null;
  sourceName?: string;
};

const defaultCapabilities = providerCapabilitiesSchema.parse({
  ...capabilities("supported"),
  intradayGmp: "unsupported",
});

export function createMockProvider(options: MockProviderOptions = {}): IpoDataProvider {
  const now = options.now ?? (() => new Date());
  const supported = providerCapabilitiesSchema.parse({ ...defaultCapabilities, ...options.capabilities });
  const behavior = options.behavior ?? {};

  async function respond(feature: ProviderFeature, value: unknown): Promise<AdapterResult> {
    const mode = behavior[feature] ?? "ok";
    if (mode === "hang") return new Promise<AdapterResult>(() => undefined);
    if (mode === "timeout") throw new ProviderTimeoutError("mock", feature);
    if (mode === "unavailable") throw new ProviderUnavailableError("mock", feature);
    return {
      source: { ...fixtureSource(now()), sourceName: options.sourceName ?? fixtureSourceName },
      value: mode === "malformed" ? { amountRupees: "not-a-number" } : value,
    };
  }

  return {
    key: "mock",
    sourceName: options.sourceName ?? fixtureSourceName,
    capabilities: supported,
    listIpos(query: IpoListQuery) {
      const rows = query.board === "sme" ? [] : [fixtureSummary(now())];
      return respond("listIpos", rows);
    },
    getIpoDetails() {
      return respond("ipoDetails", fixtureIpo(now()));
    },
    getCurrentGmp() {
      return respond("currentGmp", fixtureGmp(now(), options.gmpAmountRupees ?? 0));
    },
    getGmpHistory() {
      return respond("gmpHistory", fixtureGmpHistory(now()));
    },
    getIntradayGmp() {
      return respond("intradayGmp", { ipoId: "fixture-polymers", observations: [] });
    },
    getCurrentSubscription() {
      return respond("currentSubscription", fixtureSubscription(now()));
    },
    getSubscriptionHistory() {
      return respond("subscriptionHistory", fixtureSubscriptionHistory(now()));
    },
    getCompanyFinancials() {
      return respond("companyFinancials", fixtureFinancials());
    },
    getRegistrarDetails() {
      return respond("registrarDetails", fixtureRegistrar());
    },
    getListingInformation() {
      return respond("listingInformation", fixtureListing());
    },
  };
}
