"use client";

import { IstDateTime } from "@/components/financial/ist-date-time";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { AdminResource, metricCount, recordObject } from "@/features/admin/admin-resource";
import { useAdminSession } from "@/features/admin/admin-shell";
import { roleLabel } from "@/features/admin/admin-session";
import { MetricValue } from "@/features/admin/metric-value";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function AdminOverview() {
  const gate = useAdminSession();
  const role = gate?.state === "ready" ? roleLabel(gate.role) : "Administrator";

  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">Overview</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{`Signed in as ${role}. Provider credentials stay on the server.`}</p>
      </Card>
      <AdminResource path="/api/admin/dashboard" label="Loading the dashboard">
        {(payload) => <DashboardBody payload={payload} />}
      </AdminResource>
    </div>
  );
}

function DashboardBody({ payload }: { payload: unknown }) {
  const body = recordObject(payload);
  const records = recordObject(body?.records);
  const sync = recordObject(body?.sync);
  const provider = recordObject(body?.provider);
  const quota = recordObject(body?.quota);
  const notifications = recordObject(body?.notifications);
  const watchlist = recordObject(body?.watchlist);
  const accounts = recordObject(body?.accounts);
  const warnings = Array.isArray(body?.warnings) ? body.warnings : [];
  const incomplete = records?.complete === false && records.available === true;

  return (
    <div className="grid gap-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="IPO records">
        <StatCard label="Total IPO records" value={<MetricValue value={records?.available === true ? metricCount(records.total) : null} />} hint={incomplete ? "Counts cover the first 2000 stored rows." : undefined} />
        <StatCard label="Mainboard IPOs" value={<MetricValue value={records?.available === true ? metricCount(records.mainboard) : null} />} />
        <StatCard label="SME IPOs" value={<MetricValue value={records?.available === true ? metricCount(records.sme) : null} />} />
        <StatCard label="Open IPOs" value={<MetricValue value={records?.available === true ? metricCount(records.open) : null} />} />
        <StatCard label="Upcoming IPOs" value={<MetricValue value={records?.available === true ? metricCount(records.upcoming) : null} />} />
        <StatCard label="Listed IPOs" value={<MetricValue value={records?.available === true ? metricCount(records.listed) : null} />} />
      </section>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Operations">
        <StatCard label="Last successful synchronization" value={<IstDateTime value={text(sync?.lastSuccessAt) ? new Date(text(sync?.lastSuccessAt) as string) : null} />} hint={sync?.available === true ? undefined : "Synchronization history is unavailable."} />
        <StatCard label="Synchronization failures" value={<MetricValue value={sync?.available === true ? metricCount(sync.failed) : null} />} />
        <StatCard label="Data validation failures" value={<MetricValue value={metricCount(body?.validationFailures)} />} hint="This process" />
        <StatCard label="Provider" value={text(provider?.name) ?? "Unavailable"} hint={text(provider?.health) ?? undefined} />
        <StatCard label="Day quota remaining" value={<MetricValue value={metricCount(quota?.dayRemaining)} />} hint="Shown when usage has been counted." />
        <StatCard label="Vendor quota remaining" value={<MetricValue value={metricCount(quota?.vendorRemaining)} />} />
        <StatCard label="Registered users" value={<MetricValue value={accounts?.available === true ? metricCount(accounts.active) : null} />} hint="Active accounts" />
        <StatCard label="Watchlist rows" value={<MetricValue value={watchlist?.available === true ? metricCount(watchlist.saved) : null} />} />
        <StatCard label="Notification processing" value={<MetricValue value={metricCount(notifications?.created)} />} hint="Created in this process" />
      </section>
      <Card>
        <h2 className="text-base font-semibold text-foreground">Warnings</h2>
        {warnings.length === 0 ? <p className="mt-2 text-sm text-muted">No warnings were recorded.</p> : (
          <ul className="mt-3 grid gap-2">
            {warnings.map((item, index) => {
              const warning = recordObject(item);
              const message = text(warning?.message);
              if (!message) return null;
              return <li key={`${text(warning?.code) ?? "warning"}-${index}`} className="text-sm text-foreground">{message}</li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
