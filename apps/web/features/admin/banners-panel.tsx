"use client";

import Link from "next/link";
import { useState } from "react";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminResource, recordObject } from "@/features/admin/admin-resource";
import { readCsrfToken } from "@/features/auth/csrf";

type BannerRow = {
  id: string;
  title: string;
  status: string;
  priority: number;
  sortOrder: number;
  sponsored: boolean;
  startAt: string | null;
  endAt: string | null;
};

function rowsFrom(payload: unknown): BannerRow[] | null {
  const body = recordObject(payload);
  if (!body || !Array.isArray(body.banners)) return null;
  const rows: BannerRow[] = [];
  for (const item of body.banners) {
    const row = recordObject(item);
    if (!row || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.status !== "string" || typeof row.priority !== "number" || typeof row.sortOrder !== "number") continue;
    rows.push({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      sortOrder: row.sortOrder,
      sponsored: row.sponsored === true,
      startAt: typeof row.startAt === "string" ? row.startAt : null,
      endAt: typeof row.endAt === "string" ? row.endAt : null,
    });
  }
  return rows;
}

export function BannersPanel() {
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Banners</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Active home banners replace the built-in IPO Singh slides. Higher priority is shown first. Reorder applies among banners with the same priority.</p>
          </div>
          <Link href="/admin/banners/new" className="inline-flex h-11 items-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground">
            New banner
          </Link>
        </div>
      </Card>
      <AdminResource path="/api/admin/banners" label="Loading banners">
        {(payload) => <BannerList payload={payload} />}
      </AdminResource>
    </div>
  );
}

function BannerList({ payload }: { payload: unknown }) {
  const [rows, setRows] = useState<BannerRow[] | null>(() => rowsFrom(payload));
  const [message, setMessage] = useState<string | null>(null);

  if (!rows) return <EmptyState title="Banners are unavailable" description="The banner list could not be read." />;
  const open = rows.filter((row) => row.status !== "archived").sort((left, right) => left.sortOrder - right.sortOrder);
  const archived = rows.filter((row) => row.status === "archived");

  async function move(index: number, step: number) {
    const next = [...open];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const neighbor = next[target];
    if (!current || !neighbor) return;
    next[index] = neighbor;
    next[target] = current;
    const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
    const csrf = readCsrfToken(document.cookie);
    if (csrf) headers.set("x-csrf-token", csrf);
    const response = await fetch("/api/admin/banners/reorder", {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: next.map((row) => row.id) }),
    });
    if (!response.ok) {
      setMessage("The order was not saved.");
      return;
    }
    const body: unknown = await response.json();
    setRows(rowsFrom(body));
    setMessage("Order saved.");
  }

  return (
    <div className="grid gap-4">
      {open.length === 0 ? <EmptyState title="No banners are ready to publish." description="Create one to replace the built-in slides." /> : null}
      <ul className="grid gap-3">
        {open.map((row, index) => (
          <li key={row.id}>
            <BannerCard row={row} earlier={index > 0} later={index < open.length - 1} onEarlier={() => void move(index, -1)} onLater={() => void move(index, 1)} />
          </li>
        ))}
      </ul>
      {archived.length > 0 ? (
        <div className="grid gap-3">
          <h2 className="text-base font-semibold text-foreground">Archived</h2>
          <ul className="grid gap-3">
            {archived.map((row) => (
              <li key={row.id}>
                <BannerCard row={row} earlier={false} later={false} onEarlier={() => undefined} onLater={() => undefined} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? <p className="text-sm text-foreground" role="status">{message}</p> : null}
    </div>
  );
}

function BannerCard({ row, earlier, later, onEarlier, onLater }: { row: BannerRow; earlier: boolean; later: boolean; onEarlier: () => void; onLater: () => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/banners/${row.id}`} prefetch={false} className="text-base font-semibold text-link underline">
            {row.title}
          </Link>
          <p className="mt-1 text-sm text-muted">{`${row.status} · priority ${row.priority}${row.sponsored ? " · Sponsored" : ""}`}</p>
          <p className="mt-1 text-sm text-muted">
            Start <IstDateTime value={row.startAt ? new Date(row.startAt) : null} /> · End <IstDateTime value={row.endAt ? new Date(row.endAt) : null} />
          </p>
        </div>
        {row.status === "archived" ? null : (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={!earlier} onClick={onEarlier}>
              Move earlier
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={!later} onClick={onLater}>
              Move later
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
