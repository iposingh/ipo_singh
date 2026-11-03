"use client";

import { IstDateTime } from "@/components/financial/ist-date-time";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { AdminResource, metricCount, recordObject } from "@/features/admin/admin-resource";
import { MetricValue } from "@/features/admin/metric-value";

function when(value: unknown): Date | null {
  return typeof value === "string" ? new Date(value) : null;
}

export function AccountsPanel() {
  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">Accounts</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Counts only. Email addresses are not listed here. Role counts leave out closed accounts.</p>
      </Card>
      <AdminResource path="/api/admin/dashboard" label="Loading account figures">
        {(payload) => {
          const body = recordObject(payload);
          const accounts = recordObject(body?.accounts);
          const watchlist = recordObject(body?.watchlist);
          const notifications = recordObject(body?.notifications);
          const ready = accounts?.available === true;
          const stored = notifications?.storedAvailable === true ? metricCount(notifications.stored) : null;
          return (
            <div className="grid gap-4">
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Account status">
                <StatCard label="Members" value={<MetricValue value={ready ? metricCount(accounts?.member) : null} />} />
                <StatCard label="Admins" value={<MetricValue value={ready ? metricCount(accounts?.admin) : null} />} />
                <StatCard label="Super admins" value={<MetricValue value={ready ? metricCount(accounts?.superAdmin) : null} />} />
                <StatCard label="Pending" value={<MetricValue value={ready ? metricCount(accounts?.pending) : null} />} />
                <StatCard label="Active" value={<MetricValue value={ready ? metricCount(accounts?.active) : null} />} />
                <StatCard label="Suspended" value={<MetricValue value={ready ? metricCount(accounts?.suspended) : null} />} />
                <StatCard label="Closed" value={<MetricValue value={ready ? metricCount(accounts?.closed) : null} />} />
                <StatCard label="Watchlist rows" value={<MetricValue value={watchlist?.available === true ? metricCount(watchlist.saved) : null} />} />
                <StatCard label="Stored notices" value={<MetricValue value={stored} />} />
              </section>
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Notification processing">
                <StatCard label="Created" value={<MetricValue value={metricCount(notifications?.created)} />} hint="This process" />
                <StatCard label="Duplicates" value={<MetricValue value={metricCount(notifications?.duplicates)} />} hint="This process" />
                <StatCard label="Skipped" value={<MetricValue value={metricCount(notifications?.skipped)} />} hint="This process" />
                <StatCard label="Failed" value={<MetricValue value={metricCount(notifications?.failed)} />} hint="This process" />
                <StatCard label="Last processing finish" value={<IstDateTime value={when(notifications?.lastFinishedAt)} />} />
              </section>
            </div>
          );
        }}
      </AdminResource>
    </div>
  );
}
