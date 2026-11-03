import type { IpoListQuery } from "@ipo-singh/contracts";
import { ProviderError, ProviderNotConnectedError } from "../errors.ts";
import { provenanceFor } from "../normalize.ts";
import { ProviderOutageError, QuotaExhaustedError } from "../quota.ts";
import { capabilities, type ProviderFeature } from "../capabilities.ts";
import type { AdapterResult, IpoDataProvider } from "../provider.ts";
import { catalogVendorQuery, mapIpoCatalog, matchesCatalogQuery } from "./catalog.ts";
import { IpoGuruDisabledError, type IpoGuruClient } from "./client.ts";

const sourceName = "IPO Guru Pro";

export type IpoGuruProviderOptions = {
  client?: IpoGuruClient;
  now?: () => Date;
};

/**
 * IPO Guru Pro API v2 adapter.
 * `listIpos` calls `GET /ipos` when a backend client is enabled.
 * Current GMP uses one `GET /gmp` collection from the worker, not this per-IPO method.
 * GMP history uses one `GET /ipos/{slug}/gmp/history` from the worker, not this per-IPO method.
 * Subscription uses `GET /ipos/{slug}/subscription` and `GET /ipos/{slug}/subscription/history` from the worker.
 * These per-IPO methods stay unverified and perform no I/O. Financial, registrar, and listing reads stay unverified.
 */
export function createIpoGuruProvider(options: IpoGuruProviderOptions = {}): IpoDataProvider {
  const now = options.now ?? (() => new Date());
  const client = options.client;
  const connected = client !== undefined;

  function notConnected(feature: ProviderFeature): Promise<AdapterResult> {
    return Promise.reject(new ProviderNotConnectedError("ipo-guru", feature));
  }

  return {
    key: "ipo-guru",
    sourceName,
    capabilities: connected
      ? { ...capabilities("unverified"), listIpos: "supported" }
      : capabilities("unverified"),
    async listIpos(query: IpoListQuery) {
      if (!client) return notConnected("listIpos");
      let rows: unknown[];
      try {
        rows = await client.listIssues(catalogVendorQuery(query));
      } catch (error) {
        if (error instanceof IpoGuruDisabledError) throw new ProviderNotConnectedError("ipo-guru", "listIpos");
        if (error instanceof QuotaExhaustedError || error instanceof ProviderOutageError) throw error;
        throw new ProviderError("unavailable", "ipo-guru", "listIpos", "IPO Guru catalogue request failed.", false);
      }
      const at = now();
      const source = { sourceName, retrievedAt: at.toISOString(), sourceUpdatedAt: null };
      const mapped = mapIpoCatalog(rows, at, provenanceFor(source, at));
      const issues = mapped.issues.filter((issue) => matchesCatalogQuery(issue, query));
      const summaries = mapped.summaries.filter((summary) => issues.some((issue) => issue.id === summary.id));
      return { source, value: summaries, records: issues };
    },
    getIpoDetails() {
      return notConnected("ipoDetails");
    },
    getCurrentGmp() {
      return notConnected("currentGmp");
    },
    getGmpHistory() {
      return notConnected("gmpHistory");
    },
    getIntradayGmp() {
      return notConnected("intradayGmp");
    },
    getCurrentSubscription() {
      return notConnected("currentSubscription");
    },
    getSubscriptionHistory() {
      return notConnected("subscriptionHistory");
    },
    getCompanyFinancials() {
      return notConnected("companyFinancials");
    },
    getRegistrarDetails() {
      return notConnected("registrarDetails");
    },
    getListingInformation() {
      return notConnected("listingInformation");
    },
  };
}
