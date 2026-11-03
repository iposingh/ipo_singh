"use client";

import { IstDateTime } from "@/components/financial/ist-date-time";
import { MissingValue } from "@/components/financial/missing-value";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, type TableColumn } from "@/components/ui/table";
import { AdminResource, recordObject } from "@/features/admin/admin-resource";

type IpoRow = {
  slug: string;
  companyName: string | null;
  board: string;
  status: string | null;
  freshness: string;
  fetchedAt: string;
};

const columns: readonly TableColumn<IpoRow>[] = [
  { id: "company", header: "Company", cell: (row) => row.companyName ?? <MissingValue /> },
  { id: "board", header: "Board", cell: (row) => (row.board === "mainboard" ? "Mainboard" : "SME") },
  { id: "status", header: "Status", cell: (row) => row.status ?? <MissingValue /> },
  { id: "freshness", header: "Freshness", cell: (row) => row.freshness },
  { id: "fetched", header: "Fetched (Asia/Kolkata)", cell: (row) => <IstDateTime value={new Date(row.fetchedAt)} /> },
];

function rowsFrom(payload: unknown): { complete: boolean; records: IpoRow[] } | null {
  const body = recordObject(payload);
  if (!body || !Array.isArray(body.records) || typeof body.complete !== "boolean") return null;
  const records: IpoRow[] = [];
  for (const item of body.records) {
    const row = recordObject(item);
    if (!row || typeof row.slug !== "string" || typeof row.board !== "string" || typeof row.freshness !== "string" || typeof row.fetchedAt !== "string") continue;
    records.push({
      slug: row.slug,
      companyName: typeof row.companyName === "string" ? row.companyName : null,
      board: row.board,
      status: typeof row.status === "string" ? row.status : null,
      freshness: row.freshness,
      fetchedAt: row.fetchedAt,
    });
  }
  return { complete: body.complete, records };
}

export function RecordsPanel() {
  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">IPO records</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Read-only inspection of stored catalogue rows. Prices and provider identifiers stay off this page.</p>
      </Card>
      <AdminResource path="/api/admin/ipos" label="Loading IPO records">
        {(payload) => {
          const listed = rowsFrom(payload);
          if (!listed) return <EmptyState title="IPO records are unavailable" description="The catalogue could not be read." />;
          if (!listed.complete && listed.records.length === 0) return <EmptyState title="IPO records are unavailable" description="The catalogue could not be read." />;
          if (listed.records.length === 0) return <EmptyState title="No IPO records are stored." description="The catalogue is empty." />;
          return (
            <div className="grid gap-3">
              {listed.complete ? null : <p className="text-sm text-muted">This list shows the first 50 of the stored rows that were read.</p>}
              <Table caption="Stored IPO records" columns={columns} rows={listed.records} getRowKey={(row) => row.slug} />
            </div>
          );
        }}
      </AdminResource>
    </div>
  );
}
