import { createHash } from "node:crypto";
import type { IpoStatus } from "@ipo-singh/contracts";
import type { SyncCategory, SyncPhase, SyncPolicy } from "../config/sync-policy.ts";
import type { SyncRunRecord } from "../db/records.ts";

export type PlannedSync = {
  category: Exclude<SyncCategory, "catalog">;
  subject: string;
  phase: SyncPhase;
  calls: number;
};

const phaseRank: Record<SyncPhase, number> = {
  open: 0,
  upcoming: 1,
  other: 2,
  listed: 3,
};

const categoryRank: Record<PlannedSync["category"], number> = {
  gmp: 0,
  subscription: 1,
  financial: 2,
  history: 3,
};

const resourcePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function syncPhase(status: IpoStatus | null): SyncPhase {
  if (status === "open") return "open";
  if (status === "upcoming") return "upcoming";
  if (status === "listed") return "listed";
  return "other";
}

export function intervalFor(policy: SyncPolicy, category: SyncCategory, phase: SyncPhase): number {
  if (category === "catalog") return policy.catalogMs;
  return policy[category][`${phase}Ms`];
}

export function syncResource(category: SyncCategory, subject: string): string {
  const combined = `${category}-${subject}`;
  if (combined.length <= 40 && resourcePattern.test(combined)) return combined;
  const digest = createHash("sha256").update(`${category}:${subject}`).digest("hex").slice(0, 12);
  return `${category}-${digest}`;
}

export function lastSuccessfulSync(runs: readonly SyncRunRecord[], resource: string): Date | null {
  let best: Date | null = null;
  for (const run of runs) {
    if (run.resource !== resource || run.status !== "succeeded" || !run.finishedAt) continue;
    if (!best || run.finishedAt.getTime() > best.getTime()) best = run.finishedAt;
  }
  return best;
}

/** Latest finished attempt, including a failure, so a tick does not immediately retry the same job. */
export function lastFinishedSync(runs: readonly SyncRunRecord[], resource: string): Date | null {
  return lastFinishedRecord(runs, resource)?.finishedAt ?? null;
}

export function lastFinishedRecord(runs: readonly SyncRunRecord[], resource: string): SyncRunRecord | null {
  let best: SyncRunRecord | null = null;
  for (const run of runs) {
    if (run.resource !== resource || run.status === "running" || !run.finishedAt) continue;
    if (!best?.finishedAt || run.finishedAt.getTime() > best.finishedAt.getTime()) best = run;
  }
  return best;
}

export function syncDue(lastSuccessAt: Date | null, intervalMs: number, now: Date): boolean {
  if (!lastSuccessAt || Number.isNaN(lastSuccessAt.getTime())) return true;
  return now.getTime() - lastSuccessAt.getTime() >= intervalMs;
}

export function callsFor(category: SyncCategory): number {
  return category === "history" ? 2 : 1;
}

/**
 * Open issues come first. Upcoming issues follow. Listed issues are last.
 * A category is omitted when its last success is still inside the phase interval.
 */
export function planIssueSync(input: {
  now: Date;
  policy: SyncPolicy;
  ipos: readonly { id: string; status: IpoStatus | null }[];
  lastSuccessAt: (category: SyncCategory, subject: string) => Date | null;
  categories?: readonly SyncCategory[];
}): PlannedSync[] {
  const allowed = new Set(input.categories ?? ["gmp", "subscription", "financial", "history"]);
  const planned: PlannedSync[] = [];
  for (const ipo of input.ipos) {
    const phase = syncPhase(ipo.status);
    for (const category of ["gmp", "subscription", "financial", "history"] as const) {
      if (!allowed.has(category)) continue;
      const intervalMs = intervalFor(input.policy, category, phase);
      if (!syncDue(input.lastSuccessAt(category, ipo.id), intervalMs, input.now)) continue;
      planned.push({ category, subject: ipo.id, phase, calls: callsFor(category) });
    }
  }
  return sortPlanned(planned);
}

/**
 * One GMP history call per due issue.
 * A closed or allotment issue with a successful fetch is a completed window and is not fetched again.
 * Listed catalogue rows are not history-backfilled here so active issues reach detail enrichment first.
 */
export function planGmpHistory(input: {
  now: Date;
  policy: SyncPolicy;
  ipos: readonly { id: string; status: IpoStatus | null }[];
  lastFinishedAt: (ipoId: string) => Date | null;
  lastSuccessAt: (ipoId: string) => Date | null;
}): PlannedSync[] {
  const planned: PlannedSync[] = [];
  for (const ipo of input.ipos) {
    const phase = syncPhase(ipo.status);
    if (phase === "listed") continue;
    const settled = ipo.status === "closed" || ipo.status === "allotment";
    if (settled && input.lastSuccessAt(ipo.id)) continue;
    if (!syncDue(input.lastFinishedAt(ipo.id), intervalFor(input.policy, "history", phase), input.now)) continue;
    planned.push({ category: "history", subject: ipo.id, phase, calls: 1 });
  }
  return sortPlanned(planned);
}

export type SubscriptionFetch = {
  subject: string;
  phase: SyncPhase;
  kind: "current" | "history";
  calls: 1;
};

/**
 * Current subscription uses the subscription intervals. Open starts at 60 minutes.
 * History uses the slower history intervals. A settled issue is not fetched again after one success.
 * A plan-upgrade failure waits out the listed history interval so a Standard key does not retry every tick.
 *
 * Listed issues are excluded from current and history subscription polls so historical catalogues cannot
 * exhaust quota before open/upcoming/closed enrichment. Settled issues that already succeeded stay skipped.
 */
export function planSubscriptionSync(input: {
  now: Date;
  policy: SyncPolicy;
  kind: SubscriptionFetch["kind"];
  ipos: readonly { id: string; status: IpoStatus | null }[];
  lastRun: (ipoId: string) => SyncRunRecord | null;
}): SubscriptionFetch[] {
  const planned: SubscriptionFetch[] = [];
  for (const ipo of input.ipos) {
    const phase = syncPhase(ipo.status);
    const last = input.lastRun(ipo.id);
    if (planUpgradeCooling(last, input.policy, input.now)) continue;
    if (phase === "listed") continue;
    if (input.kind === "history") {
      const settled = ipo.status === "closed" || ipo.status === "allotment";
      if (settled && last?.status === "succeeded") continue;
      if (!syncDue(last?.finishedAt ?? null, intervalFor(input.policy, "history", phase), input.now)) continue;
    } else if (!syncDue(last?.finishedAt ?? null, intervalFor(input.policy, "subscription", phase), input.now)) {
      continue;
    }
    planned.push({ subject: ipo.id, phase, kind: input.kind, calls: 1 });
  }
  return planned.sort((left, right) => phaseRank[left.phase] - phaseRank[right.phase] || left.subject.localeCompare(right.subject));
}

/**
 * One `GET /ipos/{slug}` per due issue, on the financial interval.
 * Open issues refresh daily. Other phases wait seven days.
 * Listed catalogue rows are skipped so current/upcoming/closed enrichment is not starved.
 */
export function planIpoDetail(input: {
  now: Date;
  policy: SyncPolicy;
  ipos: readonly { id: string; status: IpoStatus | null }[];
  lastRun: (ipoId: string) => SyncRunRecord | null;
}): PlannedSync[] {
  const planned: PlannedSync[] = [];
  for (const ipo of input.ipos) {
    const phase = syncPhase(ipo.status);
    if (phase === "listed") continue;
    const last = input.lastRun(ipo.id);
    if (!syncDue(last?.finishedAt ?? null, intervalFor(input.policy, "financial", phase), input.now)) continue;
    planned.push({ category: "financial", subject: ipo.id, phase, calls: 1 });
  }
  return sortPlanned(planned);
}

function planUpgradeCooling(run: SyncRunRecord | null, policy: SyncPolicy, now: Date): boolean {
  if (!run || run.errorName !== "PlanUpgradeError" || !run.finishedAt) return false;
  return now.getTime() - run.finishedAt.getTime() < policy.history.listedMs;
}

function sortPlanned(planned: PlannedSync[]): PlannedSync[] {
  return planned.sort((left, right) => {
    const byPhase = phaseRank[left.phase] - phaseRank[right.phase];
    if (byPhase !== 0) return byPhase;
    const byCategory = categoryRank[left.category] - categoryRank[right.category];
    if (byCategory !== 0) return byCategory;
    return left.subject.localeCompare(right.subject);
  });
}
