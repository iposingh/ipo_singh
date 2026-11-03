import { timestampSchema } from "@ipo-singh/contracts";
import { z } from "zod";
import { requestJson } from "./client.ts";
import { MobileApiError, apiFailureMessage } from "./errors.ts";
import { resolveApiOrigin, type AppEnvironment, type OriginFailure } from "./origin.ts";

export const mobileHealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string().min(1),
    version: z.string().min(1),
    timestamp: timestampSchema,
    timestampIst: z.string().min(1),
  })
  .strict();

export type MobileHealthResponse = z.infer<typeof mobileHealthResponseSchema>;

export type StartupReport =
  | { status: "ready"; origin: string; health: MobileHealthResponse }
  | { status: "offline" }
  | { status: "configuration"; failure: OriginFailure }
  | { status: "unavailable"; kind: MobileApiError["kind"]; message: string };

export async function checkApiHealth(input: {
  appEnv: AppEnvironment;
  configuredOrigin: string | undefined;
  offline?: boolean;
  isPhysicalDevice?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<StartupReport> {
  if (input.offline) return { status: "offline" };
  const origin = resolveApiOrigin(input.appEnv, input.configuredOrigin, {
    isPhysicalDevice: input.isPhysicalDevice,
  });
  if (!origin.ok) return { status: "configuration", failure: origin.failure };
  try {
    const health = await requestJson({
      origin: origin.origin,
      path: "/api/v1/health",
      schema: mobileHealthResponseSchema,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
    });
    return { status: "ready", origin: origin.origin, health };
  } catch (error) {
    if (error instanceof MobileApiError) {
      if (error.kind === "cancelled") throw error;
      return { status: "unavailable", kind: error.kind, message: error.message };
    }
    return { status: "unavailable", kind: "network", message: apiFailureMessage.network };
  }
}
