"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { AccessDenied } from "@/features/admin/access-denied";
import { SessionExpired } from "@/features/admin/session-expired";
import { IstDateTime } from "@/components/financial/ist-date-time";

type ProviderAccount = {
  plan: string;
  scopes: string[];
  limits: { perMinute: number; perDay: number; gmpHistoryDays: number | null };
  expiresAt: string | null;
  observedAt: string;
};

type ProviderView = {
  provider: "not_configured" | "ipo-guru" | "mock";
  ipoGuruEnabled: boolean;
  credentialConfigured: boolean;
  minuteBudget: number | null;
  dailyBudget: number | null;
  account: ProviderAccount | null;
};

const providerLabel: Record<ProviderView["provider"], string> = {
  "not_configured": "Not configured",
  "ipo-guru": "IPO Guru",
  mock: "Mock",
};

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function readAccount(value: unknown): ProviderAccount | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.plan !== "string" || !Array.isArray(record.scopes) || typeof record.observedAt !== "string") return null;
  if (!record.limits || typeof record.limits !== "object") return null;
  const limits = record.limits as Record<string, unknown>;
  if (typeof limits.perMinute !== "number" || typeof limits.perDay !== "number") return null;
  return {
    plan: record.plan,
    scopes: record.scopes.filter((item): item is string => typeof item === "string"),
    limits: {
      perMinute: limits.perMinute,
      perDay: limits.perDay,
      gmpHistoryDays: typeof limits.gmpHistoryDays === "number" ? limits.gmpHistoryDays : null,
    },
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : null,
    observedAt: record.observedAt,
  };
}

export function ProviderPanel() {
  const [view, setView] = useState<ProviderView | "loading" | "denied" | "expired" | "error">("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/provider", { headers: { accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          setView("expired");
          return;
        }
        if (response.status === 403) {
          setView("denied");
          return;
        }
        if (!response.ok) {
          setView("error");
          return;
        }
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object") {
          setView("error");
          return;
        }
        const record = payload as Record<string, unknown>;
        if (record.provider !== "not_configured" && record.provider !== "ipo-guru" && record.provider !== "mock") {
          setView("error");
          return;
        }
        if (typeof record.ipoGuruEnabled !== "boolean" || typeof record.credentialConfigured !== "boolean") {
          setView("error");
          return;
        }
        setView({
          provider: record.provider,
          ipoGuruEnabled: record.ipoGuruEnabled,
          credentialConfigured: record.credentialConfigured,
          minuteBudget: typeof record.minuteBudget === "number" ? record.minuteBudget : null,
          dailyBudget: typeof record.dailyBudget === "number" ? record.dailyBudget : null,
          account: readAccount(record.account),
        });
      })
      .catch(() => {
        if (active) setView("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (view === "loading") return <LoadingState label="Loading provider status" />;
  if (view === "expired") return <SessionExpired />;
  if (view === "denied") return <AccessDenied />;
  if (view === "error") {
    return <ErrorState title="Provider status is unavailable" message="The status could not be loaded. Try again shortly." />;
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold text-foreground">Provider</h1>
      <p className="mt-2 text-sm leading-6 text-muted">The key, database address, and operations token are not shown.</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="text-muted">Provider</dt>
          <dd className="font-medium text-foreground">{providerLabel[view.provider]}</dd>
        </div>
        <div>
          <dt className="text-muted">IPO Guru enabled</dt>
          <dd className="font-medium text-foreground">{yesNo(view.ipoGuruEnabled)}</dd>
        </div>
        <div>
          <dt className="text-muted">Credential configured</dt>
          <dd className="font-medium text-foreground">{yesNo(view.credentialConfigured)}</dd>
        </div>
        <div>
          <dt className="text-muted">Effective minute budget</dt>
          <dd className="font-medium text-foreground">{view.minuteBudget ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt className="text-muted">Effective day budget</dt>
          <dd className="font-medium text-foreground">{view.dailyBudget ?? "Unavailable"}</dd>
        </div>
        {view.account ? (
          <>
            <div>
              <dt className="text-muted">Vendor plan</dt>
              <dd className="font-medium text-foreground">{view.account.plan}</dd>
            </div>
            <div>
              <dt className="text-muted">Vendor limits</dt>
              <dd className="font-medium text-foreground">
                {view.account.limits.perMinute}/min · {view.account.limits.perDay}/day
              </dd>
            </div>
            <div>
              <dt className="text-muted">Scopes</dt>
              <dd className="font-medium text-foreground">{view.account.scopes.join(", ") || "None reported"}</dd>
            </div>
            <div>
              <dt className="text-muted">Plan expires</dt>
              <dd className="font-medium text-foreground">{view.account.expiresAt ?? "Not reported"}</dd>
            </div>
            <div>
              <dt className="text-muted">Account observed</dt>
              <dd className="font-medium text-foreground">
                <IstDateTime value={new Date(view.account.observedAt)} />
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-muted">Vendor account</dt>
            <dd className="font-medium text-foreground">Not loaded yet. Open this page while IPO Guru is enabled to refresh GET /me once.</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
