export type AlertMetricSnapshot = {
  created: number;
  duplicates: number;
  skipped: number;
  failed: number;
  lastFinishedAt: string | null;
};

export type PushMetricSnapshot = {
  examined: number;
  sent: number;
  failed: number;
  skipped: number;
  invalidTokens: number;
  receiptConfirmed: number;
  receiptInvalidTokens: number;
  receiptPending: number;
  lastDeliveryAt: string | null;
  lastReceiptAt: string | null;
  lastDeliveryStatus: "ran" | "locked" | "unavailable" | "disabled" | null;
};

const emptyAlerts = (): AlertMetricSnapshot => ({
  created: 0,
  duplicates: 0,
  skipped: 0,
  failed: 0,
  lastFinishedAt: null,
});

const emptyPush = (): PushMetricSnapshot => ({
  examined: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  invalidTokens: 0,
  receiptConfirmed: 0,
  receiptInvalidTokens: 0,
  receiptPending: 0,
  lastDeliveryAt: null,
  lastReceiptAt: null,
  lastDeliveryStatus: null,
});

let alerts = emptyAlerts();
let push = emptyPush();

export function alertMetricsSnapshot(): AlertMetricSnapshot {
  return { ...alerts };
}

export function pushMetricsSnapshot(): PushMetricSnapshot {
  return { ...push };
}

export function recordAlertMetrics(input: {
  created: number;
  duplicates: number;
  skipped: number;
  failed: boolean;
  finishedAt: string;
}): void {
  alerts = {
    created: alerts.created + input.created,
    duplicates: alerts.duplicates + input.duplicates,
    skipped: alerts.skipped + input.skipped,
    failed: alerts.failed + (input.failed ? 1 : 0),
    lastFinishedAt: input.finishedAt,
  };
}

export function recordPushDeliveryMetrics(input: {
  status: "ran" | "locked" | "unavailable" | "disabled";
  examined: number;
  sent: number;
  failed: number;
  skipped: number;
  invalidTokens: number;
  finishedAt: string;
}): void {
  push = {
    ...push,
    examined: push.examined + input.examined,
    sent: push.sent + input.sent,
    failed: push.failed + input.failed,
    skipped: push.skipped + input.skipped,
    invalidTokens: push.invalidTokens + input.invalidTokens,
    lastDeliveryAt: input.finishedAt,
    lastDeliveryStatus: input.status,
  };
}

export function recordPushReceiptMetrics(input: {
  examined: number;
  confirmed: number;
  invalidTokens: number;
  pending: number;
  finishedAt: string;
}): void {
  push = {
    ...push,
    receiptConfirmed: push.receiptConfirmed + input.confirmed,
    receiptInvalidTokens: push.receiptInvalidTokens + input.invalidTokens,
    receiptPending: push.receiptPending + input.pending,
    lastReceiptAt: input.finishedAt,
  };
}

export function resetAlertMetrics(): void {
  alerts = emptyAlerts();
}

export function resetPushMetrics(): void {
  push = emptyPush();
}
