import { z } from "zod";

/** Features a market-data provider may implement. Unsupported ones stay explicit. */
export const providerFeatures = [
  "listIpos",
  "ipoDetails",
  "currentGmp",
  "gmpHistory",
  "intradayGmp",
  "currentSubscription",
  "subscriptionHistory",
  "companyFinancials",
  "registrarDetails",
  "listingInformation",
] as const;

export type ProviderFeature = (typeof providerFeatures)[number];

/**
 * `unverified` means this process has no live client for the feature.
 * IPO Guru `listIpos` is `supported` only while the backend catalogue client is enabled.
 * Current GMP is polled with one `GET /gmp` from the worker. The per-IPO method stays unverified.
 * GMP history is fetched with one `GET /ipos/{slug}/gmp/history` per due issue. The provider method stays unverified.
 * Subscription is fetched with one current read and one history read per due issue. Those provider methods stay unverified.
 * The other IPO Guru features stay unverified. The field mapping is in `docs/ipoguru-v2-integration.md`.
 */
export const providerCapabilitySchema = z.enum(["supported", "unsupported", "unverified"]);

export const providerCapabilitiesSchema = z
  .object({
    listIpos: providerCapabilitySchema,
    ipoDetails: providerCapabilitySchema,
    currentGmp: providerCapabilitySchema,
    gmpHistory: providerCapabilitySchema,
    intradayGmp: providerCapabilitySchema,
    currentSubscription: providerCapabilitySchema,
    subscriptionHistory: providerCapabilitySchema,
    companyFinancials: providerCapabilitySchema,
    registrarDetails: providerCapabilitySchema,
    listingInformation: providerCapabilitySchema,
  })
  .strict();

export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export function capabilities(state: ProviderCapability): ProviderCapabilities {
  return providerCapabilitiesSchema.parse({
    listIpos: state,
    ipoDetails: state,
    currentGmp: state,
    gmpHistory: state,
    intradayGmp: state,
    currentSubscription: state,
    subscriptionHistory: state,
    companyFinancials: state,
    registrarDetails: state,
    listingInformation: state,
  });
}
