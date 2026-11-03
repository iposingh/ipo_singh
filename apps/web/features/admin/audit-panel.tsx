"use client";

import { useEffect, useState } from "react";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Table, type TableColumn } from "@/components/ui/table";
import { AccessDenied } from "@/features/admin/access-denied";
import { SessionExpired } from "@/features/admin/session-expired";

type AuditEvent = {
  id: string;
  action: string;
  outcome: string;
  createdAt: string;
};

const actionLabel: Record<string, string> = {
  access_denied: "Access denied",
  role_change: "Role change",
  session_revoke: "Session revocation",
  provider_read: "Provider status",
  bootstrap: "Bootstrap",
  manual_sync: "Manual sync",
  banner_change: "Banner change",
};

const columns: readonly TableColumn<AuditEvent>[] = [
  {
    id: "action",
    header: "Action",
    cell: (row) => actionLabel[row.action] ?? "Recorded action",
  },
  {
    id: "outcome",
    header: "Outcome",
    cell: (row) => (row.outcome === "succeeded" ? "Succeeded" : "Denied"),
  },
  {
    id: "time",
    header: "Time (Asia/Kolkata)",
    cell: (row) => <IstDateTime value={new Date(row.createdAt)} />,
  },
];

export function AuditPanel() {
  const [events, setEvents] = useState<AuditEvent[] | "loading" | "denied" | "expired" | "error">("loading");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/audit", { headers: { accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          setEvents("expired");
          return;
        }
        if (response.status === 403) {
          setEvents("denied");
          return;
        }
        if (!response.ok) {
          setEvents("error");
          return;
        }
        const payload: unknown = await response.json();
        const list = payload && typeof payload === "object" && "events" in payload ? payload.events : null;
        if (!Array.isArray(list)) {
          setEvents("error");
          return;
        }
        const rows: AuditEvent[] = [];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const record = item as Partial<AuditEvent>;
          if (typeof record.id !== "string" || typeof record.action !== "string" || typeof record.outcome !== "string" || typeof record.createdAt !== "string") continue;
          rows.push({ id: record.id, action: record.action, outcome: record.outcome, createdAt: record.createdAt });
        }
        setEvents(rows);
      })
      .catch(() => {
        if (active) setEvents("error");
      });
    return () => {
      active = false;
    };
  }, []);

  if (events === "loading") return <LoadingState label="Loading the audit log" />;
  if (events === "expired") return <SessionExpired />;
  if (events === "denied") return <AccessDenied />;
  if (events === "error") return <ErrorState title="Audit log is unavailable" message="The log could not be loaded. Try again shortly." />;

  return (
    <section className="grid gap-3">
      <h1 className="text-xl font-semibold text-foreground">Audit log</h1>
      <p className="text-sm leading-6 text-muted">Recent administrator actions. Passwords and tokens are not stored.</p>
      <Table caption="Administrator audit log" columns={columns} rows={events} getRowKey={(row) => row.id} emptyLabel="No administrator actions yet" />
    </section>
  );
}
