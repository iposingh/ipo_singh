"use client";

import { useState } from "react";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { MissingValue } from "@/components/financial/missing-value";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, type TableColumn } from "@/components/ui/table";
import { AdminResource, recordObject } from "@/features/admin/admin-resource";

type Row = {
  ipoId: string;
  slug: string | null;
  companyName: string | null;
  registrarName: string | null;
  expectedAllotmentDate: string | null;
  verificationStatus: string;
  allotmentConfirmed: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  monitoringStartedAt: string | null;
  evidenceSource: string | null;
  verificationEvidence: string | null;
  matchedCompanyId: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  notificationDispatch: string;
  notificationEligibleDevices: number | null;
  notificationAccepted: number | null;
  notificationRejected: number | null;
  errorName: string | null;
  note: string | null;
};

const columns: readonly TableColumn<Row>[] = [
  { id: "company", header: "IPO", cell: (row) => row.companyName ?? row.slug ?? <MissingValue /> },
  { id: "registrar", header: "Registrar", cell: (row) => row.registrarName ?? <MissingValue /> },
  { id: "expected", header: "Expected allotment", cell: (row) => row.expectedAllotmentDate ?? <MissingValue /> },
  {
    id: "monitor",
    header: "Monitoring start",
    cell: (row) => (row.monitoringStartedAt ? <IstDateTime value={new Date(row.monitoringStartedAt)} /> : <MissingValue />),
  },
  { id: "status", header: "Verification", cell: (row) => row.verificationStatus },
  {
    id: "last",
    header: "Last checked",
    cell: (row) => (row.lastCheckedAt ? <IstDateTime value={new Date(row.lastCheckedAt)} /> : <MissingValue />),
  },
  {
    id: "next",
    header: "Next check",
    cell: (row) => (row.nextCheckAt ? <IstDateTime value={new Date(row.nextCheckAt)} /> : <MissingValue />),
  },
  { id: "source", header: "Evidence source", cell: (row) => row.evidenceSource ?? <MissingValue /> },
  { id: "matched", header: "Matched company ID", cell: (row) => row.matchedCompanyId ?? <MissingValue /> },
  {
    id: "confirmed",
    header: "Confirmed",
    cell: (row) => (row.verifiedAt ? <IstDateTime value={new Date(row.verifiedAt)} /> : row.allotmentConfirmed ? "Yes" : <MissingValue />),
  },
  {
    id: "notify",
    header: "Notifications",
    cell: (row) =>
      `${row.notificationDispatch}${row.notificationEligibleDevices != null ? ` · ${row.notificationEligibleDevices} devices` : ""}`,
  },
  { id: "error", header: "Error", cell: (row) => row.errorName ?? <MissingValue /> },
];

function rowsFrom(payload: unknown): Row[] | null {
  const body = recordObject(payload);
  if (!body || !Array.isArray(body.items)) return null;
  const rows: Row[] = [];
  for (const item of body.items) {
    const row = recordObject(item);
    if (!row || typeof row.ipoId !== "string" || typeof row.verificationStatus !== "string") continue;
    rows.push({
      ipoId: row.ipoId,
      slug: typeof row.slug === "string" ? row.slug : null,
      companyName: typeof row.companyName === "string" ? row.companyName : null,
      registrarName: typeof row.registrarName === "string" ? row.registrarName : null,
      expectedAllotmentDate: typeof row.expectedAllotmentDate === "string" ? row.expectedAllotmentDate : null,
      monitoringStartedAt: typeof row.monitoringStartedAt === "string" ? row.monitoringStartedAt : null,
      verificationStatus: row.verificationStatus,
      allotmentConfirmed: row.allotmentConfirmed === true,
      lastCheckedAt: typeof row.lastCheckedAt === "string" ? row.lastCheckedAt : null,
      nextCheckAt: typeof row.nextCheckAt === "string" ? row.nextCheckAt : null,
      evidenceSource: typeof row.evidenceSource === "string" ? row.evidenceSource : null,
      verificationEvidence: typeof row.verificationEvidence === "string" ? row.verificationEvidence : null,
      matchedCompanyId: typeof row.matchedCompanyId === "string" ? row.matchedCompanyId : null,
      sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : null,
      verifiedAt: typeof row.verifiedAt === "string" ? row.verifiedAt : null,
      notificationDispatch: typeof row.notificationDispatch === "string" ? row.notificationDispatch : "not-sent",
      notificationEligibleDevices: typeof row.notificationEligibleDevices === "number" ? row.notificationEligibleDevices : null,
      notificationAccepted: typeof row.notificationAccepted === "number" ? row.notificationAccepted : null,
      notificationRejected: typeof row.notificationRejected === "number" ? row.notificationRejected : null,
      errorName: typeof row.errorName === "string" ? row.errorName : null,
      note: typeof row.note === "string" ? row.note : null,
    });
  }
  return rows;
}

export function AllotmentPanel() {
  const [selectedId, setSelectedId] = useState("");
  const [password, setPassword] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(0);

  async function post(path: string, body: Record<string, string>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setMessage("The request was refused. Check the password and evidence fields.");
        return;
      }
      setMessage("Saved.");
      setVersion((value) => value + 1);
    } catch {
      setMessage("The request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">Allotment verification</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Automated checks use official registrar portals where permitted. Manual confirmation still requires a verified source URL and an explanation.
          A passed allotment date alone does not confirm results.
        </p>
      </Card>
      <AdminResource key={version} path="/api/admin/allotment-verifications" label="Loading allotment verification">
        {(payload) => {
          const rows = rowsFrom(payload);
          if (!rows) return <EmptyState title="Allotment verification is unavailable" description="The verification list could not be read." />;
          if (rows.length === 0) return <EmptyState title="No closed or allotment IPOs are stored." description="Verification rows appear after issues close." />;
          const selected = rows.find((row) => row.ipoId === selectedId) ?? null;
          return (
            <div className="grid gap-4">
              <Table caption="Allotment verification status" columns={columns} rows={rows} getRowKey={(row) => row.ipoId} />
              <Card className="grid gap-3">
                <label className="grid gap-1 text-sm">
                  Select IPO
                  <select
                    value={selectedId}
                    onChange={(event) => {
                      const next = rows.find((row) => row.ipoId === event.target.value) ?? null;
                      setSelectedId(event.target.value);
                      setSourceUrl(next?.sourceUrl ?? "");
                      setEvidenceNote("");
                      setMessage(null);
                    }}
                    className="h-10 rounded-control border border-border bg-background px-3"
                  >
                    <option value="">Choose an IPO</option>
                    {rows.map((row) => (
                      <option key={row.ipoId} value={row.ipoId}>
                        {row.companyName ?? row.slug ?? row.ipoId}
                      </option>
                    ))}
                  </select>
                </label>
                {selected ? (
                  <>
                    <p className="text-sm text-muted">{selected.note ?? "No verification note is stored."}</p>
                    {selected.verificationEvidence ? <p className="text-sm text-foreground">Evidence: {selected.verificationEvidence}</p> : null}
                    {selected.sourceUrl ? (
                      <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline-offset-2 hover:underline">
                        Open evidence source
                      </a>
                    ) : null}
                    <label className="grid gap-1 text-sm">
                      Current password
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-10 rounded-control border border-border bg-background px-3"
                        autoComplete="current-password"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Source URL (manual confirm)
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                        className="h-10 rounded-control border border-border bg-background px-3"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Evidence note (manual confirm)
                      <textarea
                        value={evidenceNote}
                        onChange={(event) => setEvidenceNote(event.target.value)}
                        className="min-h-24 rounded-control border border-border bg-background px-3 py-2"
                        maxLength={1000}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        loading={pending}
                        onClick={() =>
                          void post("/api/admin/allotment-verifications/retry", {
                            ipoId: selected.ipoId,
                            currentPassword: password,
                          })
                        }
                      >
                        Retry supported check
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        loading={pending}
                        onClick={() =>
                          void post("/api/admin/allotment-verifications/confirm", {
                            ipoId: selected.ipoId,
                            sourceUrl,
                            evidenceNote,
                            currentPassword: password,
                          })
                        }
                      >
                        Confirm manually
                      </Button>
                    </div>
                  </>
                ) : null}
                {message ? <p className="text-sm text-muted">{message}</p> : null}
              </Card>
            </div>
          );
        }}
      </AdminResource>
    </div>
  );
}
