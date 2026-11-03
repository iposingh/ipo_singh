import type { IpoListQuery } from "@ipo-singh/contracts";
import type { ProviderCapabilities } from "./capabilities.ts";

export const providerKeys = ["ipo-guru", "mock"] as const;

export type ProviderKey = (typeof providerKeys)[number];

/** Metadata that travels with one provider response. It is not merged across providers. */
export type ProviderSource = {
  sourceName: string;
  retrievedAt: string | null;
  sourceUpdatedAt: string | null;
};

export type AdapterResult = {
  source: ProviderSource;
  value: unknown;
  /** Full issues from a catalogue list. Absent when the adapter only returned summaries. */
  records?: readonly unknown[];
};

/**
 * Backend-only market-data boundary.
 * Web and mobile clients must not implement or call this interface.
 */
export type IpoDataProvider = {
  readonly key: ProviderKey;
  readonly sourceName: string;
  readonly capabilities: ProviderCapabilities;
  listIpos(query: IpoListQuery): Promise<AdapterResult>;
  getIpoDetails(ipoId: string): Promise<AdapterResult>;
  getCurrentGmp(ipoId: string): Promise<AdapterResult>;
  getGmpHistory(ipoId: string): Promise<AdapterResult>;
  getIntradayGmp(ipoId: string): Promise<AdapterResult>;
  getCurrentSubscription(ipoId: string): Promise<AdapterResult>;
  getSubscriptionHistory(ipoId: string): Promise<AdapterResult>;
  getCompanyFinancials(ipoId: string): Promise<AdapterResult>;
  getRegistrarDetails(ipoId: string): Promise<AdapterResult>;
  getListingInformation(ipoId: string): Promise<AdapterResult>;
};
