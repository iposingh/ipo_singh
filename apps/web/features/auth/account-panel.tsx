"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ProfileForms } from "@/features/account/profile-forms";
import { readCsrfToken } from "@/features/auth/csrf";
import { accountSessionResponseSchema, type PublicAccount, type PublicSession } from "@ipo-singh/contracts";

type AccountSession = {
  account: PublicAccount;
  sessions: PublicSession[];
};

type PanelState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; session: AccountSession }
  | { status: "error"; message: string };

function csrfHeaders(): Headers {
  const headers = new Headers({ accept: "application/json" });
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  return headers;
}

function isSession(value: unknown): value is AccountSession {
  const parsed = accountSessionResponseSchema.safeParse(value);
  if (!parsed.success) return false;
  return parsed.data.account.email !== undefined;
}

export function AccountPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [busy, setBusy] = useState<"logout" | "all" | string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let response = await fetch("/api/auth/session", { headers: csrfHeaders(), cache: "no-store" });
        if (response.status === 401) {
          const refreshed = await fetch("/api/auth/refresh", { method: "POST", headers: csrfHeaders(), cache: "no-store" });
          if (refreshed.ok) response = await fetch("/api/auth/session", { headers: csrfHeaders(), cache: "no-store" });
        }
        if (cancelled) return;
        if (response.status === 401) {
          setState({ status: "anonymous" });
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isSession(payload)) {
          setState({ status: "error", message: "Your account could not be loaded." });
          return;
        }
        setState({ status: "ready", session: payload });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Sign-in is temporarily unavailable." });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout(allDevices: boolean) {
    setBusy(allDevices ? "all" : "logout");
    setActionError(null);
    try {
      const response = await fetch(allDevices ? "/api/auth/logout-all" : "/api/auth/logout", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!response.ok) {
        setActionError("The session could not be ended. Try again.");
        return;
      }
      setState({ status: "anonymous" });
    } catch {
      setActionError("Sign-in is temporarily unavailable.");
    } finally {
      setBusy(null);
    }
  }

  if (state.status === "loading") return <LoadingState label="Checking your session" />;
  if (state.status === "error") return <ErrorState title="Account unavailable" message={state.message} />;
  if (state.status === "anonymous") {
    return (
      <Card className="grid gap-4">
        <p className="text-sm leading-6 text-muted">
          Browsing IPO pages does not require an account. Email verification and password reset emails are not sent.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex h-11 items-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
            Sign in
          </Link>
          <Link href="/register" className="inline-flex h-11 items-center rounded-control border border-border px-4 text-sm font-medium text-foreground">
            Create an account
          </Link>
        </div>
      </Card>
    );
  }

  const { account, sessions } = state.session;
  const activeSessions = sessions.filter((item) => item.revokedAt === null);

  async function revokeSession(sessionId: string) {
    setBusy(sessionId);
    setActionError(null);
    try {
      const headers = csrfHeaders();
      headers.set("content-type", "application/json");
      const response = await fetch("/api/auth/revoke-session", {
        method: "POST",
        headers,
        body: JSON.stringify({ sessionId }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSession(payload)) {
        setActionError("That session could not be signed out.");
        return;
      }
      setState({ status: "ready", session: payload });
    } catch {
      setActionError("Sign-in is temporarily unavailable.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <ProfileForms
        account={account}
        onAccount={(next) => setState({ status: "ready", session: { ...state.session, account: next } })}
        onAccountClosed={() => setState({ status: "anonymous" })}
      />
      <Card className="grid gap-3">
        <h2 className="text-lg font-semibold text-foreground">Sessions</h2>
        {activeSessions.length === 0 ? <p className="text-sm text-muted">No active sessions are stored.</p> : null}
        <ul className="grid gap-2">
          {activeSessions.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-foreground">{item.client}</span>
                <span className="text-muted">{item.current ? " This device" : " Signed in"}</span>
              </span>
              {item.current ? null : (
                <Button type="button" variant="secondary" loading={busy === item.id} onClick={() => void revokeSession(item.id)}>
                  {busy === item.id ? "Signing out" : "Sign out this session"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {actionError ? (
          <p role="alert" className="text-sm text-negative-text">
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" loading={busy === "logout"} onClick={() => void logout(false)}>
            {busy === "logout" ? "Signing out" : "Log out"}
          </Button>
          <Button type="button" variant="danger" loading={busy === "all"} onClick={() => void logout(true)}>
            {busy === "all" ? "Signing out" : "Log out of all devices"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
