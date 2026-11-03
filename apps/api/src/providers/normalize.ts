import {
  financialPeriodSchema,
  gmpHistorySchema,
  gmpSnapshotSchema,
  ipoListQuerySchema,
  ipoSchema,
  ipoSummarySchema,
  listingPerformanceSchema,
  provenanceSchema,
  registrarSchema,
  stableIdSchema,
  subscriptionHistorySchema,
  subscriptionSnapshotSchema,
  type FreshnessState,
  type Provenance,
} from "@ipo-singh/contracts";
import { resolveFreshness } from "@ipo-singh/core";
import { z } from "zod";
import type { ProviderFeature } from "./capabilities.ts";
import { ProviderPayloadError } from "./errors.ts";
import type { ProviderSource } from "./provider.ts";

const sourceSchema = z
  .object({
    sourceName: z.string().trim().min(1).max(80),
    retrievedAt: z.string().datetime({ offset: true }).nullable(),
    sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

const featureSchemas = {
  listIpos: z.array(ipoSummarySchema),
  ipoDetails: ipoSchema,
  currentGmp: gmpSnapshotSchema,
  gmpHistory: gmpHistorySchema,
  intradayGmp: gmpHistorySchema,
  currentSubscription: subscriptionSnapshotSchema,
  subscriptionHistory: subscriptionHistorySchema,
  companyFinancials: z.array(financialPeriodSchema),
  registrarDetails: registrarSchema,
  listingInformation: listingPerformanceSchema,
} satisfies Record<ProviderFeature, z.ZodType>;

export type NormalizedFeatureValue<Feature extends ProviderFeature> = z.infer<(typeof featureSchemas)[Feature]>;

function fieldNames(error: z.ZodError): string[] {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    fields.add(path || "payload");
  }
  return [...fields].sort();
}

export function normalizeProviderPayload<Feature extends ProviderFeature>(
  feature: Feature,
  value: unknown,
  providerKey: string,
): NormalizedFeatureValue<Feature> {
  const parsed = featureSchemas[feature].safeParse(value);
  if (!parsed.success) throw new ProviderPayloadError(providerKey, feature, fieldNames(parsed.error));
  return parsed.data;
}

export function normalizeProviderSource(value: unknown, providerKey: string, feature: ProviderFeature): ProviderSource {
  const parsed = sourceSchema.safeParse(value);
  if (!parsed.success) throw new ProviderPayloadError(providerKey, feature, fieldNames(parsed.error));
  return parsed.data;
}

export function normalizeIpoId(ipoId: string, providerKey: string, feature: ProviderFeature): string {
  const parsed = stableIdSchema.safeParse(ipoId);
  if (!parsed.success) throw new ProviderPayloadError(providerKey, feature, ["ipoId"]);
  return parsed.data;
}

export function normalizeListQuery(query: unknown, providerKey: string): z.infer<typeof ipoListQuerySchema> {
  const parsed = ipoListQuerySchema.safeParse(query);
  if (!parsed.success) throw new ProviderPayloadError(providerKey, "listIpos", fieldNames(parsed.error));
  return parsed.data;
}

export function provenanceFor(source: ProviderSource, now: Date): Provenance {
  return provenanceSchema.parse({
    sourceName: source.sourceName,
    retrievedAt: source.retrievedAt,
    freshness: resolveFreshness(source.sourceUpdatedAt ? new Date(source.sourceUpdatedAt) : null, now),
  });
}

/** A claimed freshness that disagrees with the observation time is rejected rather than rewritten. */
export function assertObservationFreshness(
  observedAt: string | null,
  freshness: FreshnessState,
  now: Date,
  providerKey: string,
  feature: ProviderFeature,
): void {
  const expected = resolveFreshness(observedAt ? new Date(observedAt) : null, now);
  if (freshness !== expected) throw new ProviderPayloadError(providerKey, feature, ["freshness"]);
}
