"use client";

import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { AdminResource, metricCount, recordObject } from "@/features/admin/admin-resource";
import { MetricValue } from "@/features/admin/metric-value";

export function CachePanel() {
  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">Cache</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Counters belong to this API process. A zero is a counted zero. Health says whether Redis is connected.</p>
      </Card>
      <AdminResource path="/api/admin/dashboard" label="Loading cache figures">
        {(payload) => {
          const cache = recordObject(recordObject(payload)?.cache);
          const database = recordObject(payload)?.database;
          const health = typeof cache?.health === "string" ? cache.health : "unavailable";
          return (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Cache performance">
              <StatCard label="Redis" value={health} />
              <StatCard label="MongoDB" value={typeof database === "string" ? database : "unavailable"} />
              <StatCard label="Hits" value={<MetricValue value={metricCount(cache?.hits)} />} hint="This process" />
              <StatCard label="Misses" value={<MetricValue value={metricCount(cache?.misses)} />} hint="This process" />
              <StatCard label="Stale hits" value={<MetricValue value={metricCount(cache?.staleHits)} />} hint="This process" />
              <StatCard label="Origin loads" value={<MetricValue value={metricCount(cache?.originLoads)} />} hint="This process" />
              <StatCard label="Origin failures" value={<MetricValue value={metricCount(cache?.originFailures)} />} hint="This process" />
              <StatCard label="Store errors" value={<MetricValue value={metricCount(cache?.storeErrors)} />} hint="This process" />
            </section>
          );
        }}
      </AdminResource>
    </div>
  );
}
