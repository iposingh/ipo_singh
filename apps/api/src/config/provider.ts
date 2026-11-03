import { z } from "zod";
import { providerKeys, type ProviderKey } from "../providers/provider.ts";
import { ConfigError } from "../shared/errors.ts";

const providerKeySchema = z.enum(providerKeys);
const timeoutSchema = z.coerce.number().int().min(100).max(60_000);

const providerEnvSchema = z
  .object({
    IPO_DATA_TIMEOUT_MS: timeoutSchema.default(8_000),
  })
  .strict();

export type ProviderSelection = {
  primary: ProviderKey;
  fallback: ProviderKey | null;
  timeoutMs: number;
};

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fieldsFromZod(error: z.ZodError): string[] {
  const fields = new Set<string>();
  for (const issue of error.issues) {
    const name = issue.path[0];
    fields.add(typeof name === "string" ? name : "environment");
  }
  return [...fields].sort();
}

function parseKey(value: string | undefined, field: string): ProviderKey | null {
  if (!value) return null;
  const parsed = providerKeySchema.safeParse(value);
  if (!parsed.success) throw new ConfigError([field]);
  return parsed.data;
}

/**
 * Selects a backend provider. A missing primary leaves the client unconfigured.
 * The fixture provider is refused in production so synthetic rows cannot be served there.
 */
export function readProviderSelection(
  env: Record<string, string | undefined>,
  nodeEnv: "development" | "test" | "production",
): ProviderSelection | null {
  const parsed = providerEnvSchema.safeParse({
    IPO_DATA_TIMEOUT_MS: blankToUndefined(env.IPO_DATA_TIMEOUT_MS),
  });
  if (!parsed.success) throw new ConfigError(fieldsFromZod(parsed.error));

  const primary = parseKey(blankToUndefined(env.IPO_DATA_PROVIDER), "IPO_DATA_PROVIDER");
  const fallback = parseKey(blankToUndefined(env.IPO_DATA_FALLBACK_PROVIDER), "IPO_DATA_FALLBACK_PROVIDER");
  if (!primary && fallback) throw new ConfigError(["IPO_DATA_PROVIDER"]);
  if (!primary) return null;
  if (fallback === primary) throw new ConfigError(["IPO_DATA_FALLBACK_PROVIDER"]);
  if (nodeEnv === "production" && primary === "mock") throw new ConfigError(["IPO_DATA_PROVIDER"]);
  if (nodeEnv === "production" && fallback === "mock") throw new ConfigError(["IPO_DATA_FALLBACK_PROVIDER"]);

  return { primary, fallback, timeoutMs: parsed.data.IPO_DATA_TIMEOUT_MS };
}
