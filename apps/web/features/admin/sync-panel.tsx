"use client";

import { useState, type FormEvent } from "react";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { MissingValue } from "@/components/financial/missing-value";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, type TableColumn } from "@/components/ui/table";
import { AdminResource, recordObject } from "@/features/admin/admin-resource";
import { useAdminSession } from "@/features/admin/admin-shell";
import { readCsrfToken } from "@/features/auth/csrf";

type SyncRow = {
  resource: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  fetchedCount: number;
  errorName: string | null;
};

const columns: readonly TableColumn<SyncRow>[] = [
  { id: "resource", header: "Resource", cell: (row) => row.resource },
  { id: "status", header: "Status", cell: (row) => row.status },
  { id: "started", header: "Started (Asia/Kolkata)", cell: (row) => <IstDateTime value={new Date(row.startedAt)} /> },
  { id: "finished", header: "Finished (Asia/Kolkata)", cell: (row) => <IstDateTime value={row.finishedAt ? new Date(row.finishedAt) : null} /> },
  { id: "fetched", header: "Fetched", cell: (row) => row.fetchedCount.toLocaleString("en-IN"), numeric: true },
  { id: "error", header: "Error", cell: (row) => row.errorName ?? <MissingValue /> },
];

function historyFrom(payload: unknown): { available: boolean; runs: SyncRow[] } | null {
  const body = recordObject(payload);
  if (!body || typeof body.available !== "boolean" || !Array.isArray(body.runs)) return null;
  const runs: SyncRow[] = [];
  for (const item of body.runs) {
    const row = recordObject(item);
    if (!row || typeof row.resource !== "string" || typeof row.status !== "string" || typeof row.startedAt !== "string" || typeof row.fetchedCount !== "number") continue;
    runs.push({
      resource: row.resource,
      status: row.status,
      startedAt: row.startedAt,
      finishedAt: typeof row.finishedAt === "string" ? row.finishedAt : null,
      fetchedCount: row.fetchedCount,
      errorName: typeof row.errorName === "string" ? row.errorName : null,
    });
  }
  return { available: body.available, runs };
}

export function SyncPanel() {
  const gate = useAdminSession();
  const superAdmin = gate?.state === "ready" && gate.role === "super-admin";

  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">Synchronization</h1>
        <p className="mt-2 text-sm leading-6 text-muted">History comes from stored runs. A manual start is one catalogue request and needs the current password.</p>
      </Card>
      {superAdmin ? <ManualSync /> : <p className="text-sm text-muted">A super admin can start one catalogue synchronization.</p>}
      <AdminResource path="/api/admin/sync" label="Loading synchronization history">
        {(payload) => {
          const history = historyFrom(payload);
          if (!history || !history.available) return <EmptyState title="Synchronization history is unavailable" description="Stored runs could not be read." />;
          if (history.runs.length === 0) return <EmptyState title="No synchronization runs are stored." description="The history is empty." />;
          return <Table caption="Recent synchronization runs" columns={columns} rows={history.runs} getRowKey={(row) => `${row.resource}-${row.startedAt}`} />;
        }}
      </AdminResource>
    </div>
  );
}

function ManualSync() {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
      const csrf = readCsrfToken(document.cookie);
      if (csrf) headers.set("x-csrf-token", csrf);
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers,
        body: JSON.stringify({ currentPassword: password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const body = recordObject(payload);
      if (response.ok && typeof body?.status === "string") {
        setMessage(`Synchronization ${body.status}. Fetched ${typeof body.fetchedCount === "number" ? body.fetchedCount : 0}.`);
        setPassword("");
        return;
      }
      setMessage(typeof body?.message === "string" ? body.message : "Synchronization was not started.");
    } catch {
      setMessage("Synchronization was not started.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form className="grid max-w-md gap-4" onSubmit={(event) => void submit(event)}>
        <Input id="admin-sync-password" label="Current password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button type="submit" loading={pending} disabled={pending || password.length === 0}>
          Start catalogue sync
        </Button>
        {message ? <p className="text-sm text-foreground" role="status">{message}</p> : null}
      </form>
    </Card>
  );
}
