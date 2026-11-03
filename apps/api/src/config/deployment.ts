import { z } from "zod";
import { ConfigError } from "../shared/errors.ts";

export const deploymentEnvSchema = z.enum(["development", "staging", "production", "test"]);

export type DeploymentEnv = z.infer<typeof deploymentEnvSchema>;

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Logical deployment lane for data-store and cache isolation.
 * Staging often runs with NODE_ENV=production; set IPO_SINGH_DEPLOYMENT=staging explicitly.
 */
export function readDeploymentEnv(
  env: Record<string, string | undefined>,
  nodeEnv: "development" | "test" | "production",
): DeploymentEnv {
  const raw = blankToUndefined(env.IPO_SINGH_DEPLOYMENT);
  if (raw) {
    const parsed = deploymentEnvSchema.safeParse(raw);
    if (!parsed.success) throw new ConfigError(["IPO_SINGH_DEPLOYMENT"]);
    if (parsed.data === "production" && nodeEnv !== "production") {
      throw new ConfigError(["IPO_SINGH_DEPLOYMENT"]);
    }
    return parsed.data;
  }
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

/** Short Redis / cache key segment so shared Redis instances do not collide across lanes. */
export function cacheEnvironmentSegment(deployment: DeploymentEnv): string {
  if (deployment === "production") return "prod";
  if (deployment === "staging") return "staging";
  if (deployment === "test") return "test";
  return "dev";
}
