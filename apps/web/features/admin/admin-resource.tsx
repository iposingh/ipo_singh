"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { AccessDenied } from "@/features/admin/access-denied";
import { SessionExpired } from "@/features/admin/session-expired";

type ResourceState =
  | { status: "loading" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "rate_limited" }
  | { status: "error" }
  | { status: "ready"; payload: unknown };

const maxAttempts = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header && /^\d+$/.test(header)) return Math.min(8_000, Number(header) * 1_000);
  return Math.min(4_000, 400 * 2 ** attempt);
}

export function AdminResource({ path, label, children }: { path: string; label: string; children: (payload: unknown) => ReactNode }) {
  const [state, setState] = useState<ResourceState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const response = await fetch(path, {
            headers: { accept: "application/json" },
            cache: "no-store",
            signal: controller.signal,
          });
          if (!active) return;
          if (response.status === 401) {
            setState({ status: "expired" });
            return;
          }
          if (response.status === 403) {
            setState({ status: "denied" });
            return;
          }
          if (response.status === 429) {
            if (attempt + 1 < maxAttempts) {
              await sleep(retryDelayMs(response, attempt));
              continue;
            }
            setState({ status: "rate_limited" });
            return;
          }
          if (!response.ok) {
            setState({ status: "error" });
            return;
          }
          setState({ status: "ready", payload: (await response.json()) as unknown });
          return;
        } catch {
          if (!active || controller.signal.aborted) return;
          if (attempt + 1 < maxAttempts) {
            await sleep(retryDelayMs(new Response(null, { status: 503 }), attempt));
            continue;
          }
          setState({ status: "error" });
          return;
        }
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [path]);

  if (state.status === "loading") return <LoadingState label={label} />;
  if (state.status === "expired") return <SessionExpired />;
  if (state.status === "denied") return <AccessDenied />;
  if (state.status === "rate_limited") {
    return (
      <ErrorState
        title="Too many administration requests"
        message="The server asked this browser to wait briefly. Refresh in a few seconds."
      />
    );
  }
  if (state.status === "error") return <ErrorState title="Administration is unavailable" message="The latest figures could not be loaded." />;
  return children(state.payload);
}

export function metricCount(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  return null;
}

export function recordObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
