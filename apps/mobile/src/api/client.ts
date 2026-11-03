import { apiErrorSchema } from "@ipo-singh/contracts";
import type { z } from "zod";
import { MobileApiError, apiFailureMessage } from "./errors.ts";

const defaultTimeoutMs = 8_000;

export type RequestJsonInput<T> = {
  origin: string;
  path: string;
  schema: z.ZodType<T>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

function endpoint(origin: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new MobileApiError("configuration", apiFailureMessage.invalid);
  }
  return new URL(path, origin).toString();
}

function httpMessage(body: unknown): string {
  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) return apiFailureMessage.http;
  return parsed.data.fieldErrors?.[0]?.message ?? parsed.data.message;
}

export async function requestJson<T>(input: RequestJsonInput<T>): Promise<T> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  let timedOut = false;
  const onCallerAbort = () => controller.abort();
  if (input.signal?.aborted) controller.abort();
  else input.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(endpoint(input.origin, input.path), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        ...input.headers,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new MobileApiError("malformed", apiFailureMessage.malformed, response.status);
      }
    }
    if (!response.ok) throw new MobileApiError("http", httpMessage(payload), response.status);
    const parsed = input.schema.safeParse(payload);
    if (!parsed.success) throw new MobileApiError("malformed", apiFailureMessage.malformed, response.status);
    return parsed.data;
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    if (input.signal?.aborted) throw new MobileApiError("cancelled", "The request was cancelled.");
    if (timedOut) throw new MobileApiError("timeout", apiFailureMessage.timeout);
    throw new MobileApiError("network", apiFailureMessage.network);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onCallerAbort);
  }
}
