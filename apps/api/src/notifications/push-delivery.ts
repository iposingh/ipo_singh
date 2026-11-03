import { normalizeAccountPreferences } from "../accounts/session-service.ts";
import { createAccountId } from "../accounts/tokens.ts";
import type { AlertPolicy } from "../config/alert-policy.ts";
import type { DatabaseHandle } from "../db/handle.ts";
import type { SyncLock } from "../jobs/lock.ts";
import type { Logger } from "../shared/logger.ts";
import { anonymousAllowsBoardAlerts } from "./eligibility.ts";
import { recordPushDeliveryMetrics, recordPushReceiptMetrics } from "./metrics.ts";
import type { NotificationRecord } from "./records.ts";
import type { NotificationKind } from "./evaluate.ts";
import type { PushTokenRecord } from "./push-records.ts";
import { isAnonymousPushOwner } from "./push-tokens.ts";

const expoPushUrl = "https://exp.host/--/api/v2/push/send";
const expoReceiptUrl = "https://exp.host/--/api/v2/push/getReceipts";
const maxPushesPerUser = 8;
const closingHourMaxAgeMs = 90 * 60 * 1000;
const reminderMaxAgeMs = 36 * 60 * 60 * 1000;

export type PushDeliveryResult = {
  status: "ran" | "locked" | "unavailable" | "disabled";
  examined: number;
  sent: number;
  failed: number;
  skipped: number;
  invalidTokens: number;
};

export type PushReceiptResult = {
  status: "ran" | "locked" | "unavailable" | "disabled";
  examined: number;
  confirmed: number;
  invalidTokens: number;
  pending: number;
};

type Ticket =
  | { status: "sent"; ticketId: string | null }
  | { status: "invalid"; code: string }
  | { status: "retry"; code: string };

type PushWork = {
  notification: NotificationRecord;
  token: PushTokenRecord;
  attempt: number;
};

function retryDelayMs(previousAttempts: number): number {
  if (previousAttempts <= 0) return 0;
  return Math.min(15 * 60 * 1000, 60_000 * 2 ** (previousAttempts - 1));
}

function reminderTooLate(record: NotificationRecord, now: Date): boolean {
  const age = now.getTime() - record.createdAt.getTime();
  if (record.dedupeKey.startsWith("closing:1h:")) return age > closingHourMaxAgeMs;
  return age > reminderMaxAgeMs;
}

function pushAllowed(preferences: ReturnType<typeof normalizeAccountPreferences>, type: string): boolean {
  if (!preferences.alertsEnabled || preferences.mobilePush !== "when-available") return false;
  const categories: Record<string, boolean> = preferences.notificationCategories;
  if (categories[type] !== true) return false;
  // Digests and announcements: require Mainboard global opt-in.
  if (type === "announcement") return preferences.mainboardGlobalAlerts === true;
  // Board-specific gating was applied when the notice was queued; still require a board channel on.
  return preferences.mainboardGlobalAlerts === true || preferences.smeWatchlistAlerts === true;
}

function anonymousPushAllowed(token: PushTokenRecord, type: string): boolean {
  const gate = {
    mainboardGlobalAlerts: token.mainboardGlobalAlerts,
    smeWatchlistAlerts: token.smeWatchlistAlerts,
    allotmentAlertsEnabled: token.allotmentAlertsEnabled,
  };
  if (type === "announcement") return token.mainboardGlobalAlerts === true;
  const kind = type as NotificationKind;
  return anonymousAllowsBoardAlerts(gate, "mainboard", kind) || anonymousAllowsBoardAlerts(gate, "sme", kind);
}

function messageFor(work: PushWork): {
  to: string;
  title: string;
  body: string;
  data: { ipoId: string | null; slug: string | null; notificationId: string };
  sound: null;
  priority: "default";
  channelId: "ipo-reminders";
} {
  return {
    to: work.token.token,
    title: work.notification.title,
    body: work.notification.body,
    data: {
      ipoId: work.notification.ipoId,
      slug: work.notification.ipoId,
      notificationId: work.notification.id,
    }, // allotment broadcasts store the IPO slug in ipoId for deep links
    sound: null,
    priority: "default",
    channelId: "ipo-reminders",
  };
}


function ticketsFrom(payload: unknown, count: number): Ticket[] | null {
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data) || payload.data.length !== count) {
    return null;
  }
  return payload.data.map((item) => {
    if (!item || typeof item !== "object") return { status: "retry", code: "malformed" };
    if ("status" in item && item.status === "ok") {
      const ticketId = "id" in item && typeof item.id === "string" && item.id.trim().length > 0 ? item.id.trim().slice(0, 120) : null;
      return { status: "sent", ticketId };
    }
    const details = "details" in item && item.details && typeof item.details === "object" ? item.details : null;
    const code = details && "error" in details && typeof details.error === "string" ? details.error.slice(0, 80) : "error";
    if (code === "DeviceNotRegistered") return { status: "invalid", code };
    return { status: "retry", code };
  });
}

async function readTickets(input: {
  messages: ReturnType<typeof messageFor>[];
  accessToken: string | null;
  fetchImpl: typeof fetch;
}): Promise<Ticket[]> {
  const retry = input.messages.map((): Ticket => ({ status: "retry", code: "unavailable" }));
  if (input.messages.length === 0) return [];
  try {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (input.accessToken) headers.authorization = `Bearer ${input.accessToken}`;
    const response = await input.fetchImpl(expoPushUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(input.messages),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return input.messages.map((): Ticket => ({ status: "retry", code: "http" }));
    const tickets = ticketsFrom(await response.json(), input.messages.length);
    return tickets ?? retry;
  } catch {
    return retry;
  }
}

/**
 * Sends stored in-app notices to Expo push tokens.
 * It does not call a market-data provider and it does not send email or SMS.
 */
export async function runPushDelivery(input: {
  database: DatabaseHandle;
  locks: SyncLock;
  policy: AlertPolicy;
  logger: Logger;
  accessToken?: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<PushDeliveryResult> {
  const empty = { examined: 0, sent: 0, failed: 0, skipped: 0, invalidTokens: 0 };
  const finishDelivery = (
    status: PushDeliveryResult["status"],
    counts: Omit<PushDeliveryResult, "status">,
  ): PushDeliveryResult => {
    const finishedAt = new Date().toISOString();
    recordPushDeliveryMetrics({ status, ...counts, finishedAt });
    input.logger.info("push_delivery", { status, ...counts });
    return { status, ...counts };
  };
  if (!input.policy.pushDeliveryEnabled) {
    return finishDelivery("disabled", empty);
  }
  const notifications = input.database.notifications;
  const pushTokens = input.database.pushTokens;
  const accounts = input.database.accounts;
  if (!notifications || !pushTokens || !accounts) return finishDelivery("unavailable", empty);

  const release = await input.locks.acquire("push-delivery", input.policy.lockMs);
  if (!release) return finishDelivery("locked", empty);

  const now = input.now ?? new Date();
  let examined = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let invalidTokens = 0;
  try {
    const pending = await notifications.listPushPending(now, input.policy.batchSize);
    examined = pending.length;
    const users = await accounts.findUsers([...new Set(pending.map((record) => record.userId))]);
    const byUser = new Map(users.map((user) => [user.id, user]));
    const work: PushWork[] = [];
    const room = new Map<string, number>();

    for (const record of pending) {
      const tokens = await pushTokens.listActive(record.userId);
      if (tokens.length === 0) {
        await notifications.setPushStatus(record.id, "skipped");
        skipped += 1;
        continue;
      }
      const anonymousOwner =
        isAnonymousPushOwner(record.userId) || tokens.every((token) => token.ownerKind === "anonymous");
      if (anonymousOwner) {
        const token = tokens.find((item) => item.ownerKind === "anonymous") ?? tokens[0];
        if (!token || !anonymousPushAllowed(token, record.type) || reminderTooLate(record, now)) {
          await notifications.setPushStatus(record.id, "skipped");
          skipped += 1;
          continue;
        }
      } else {
        const user = byUser.get(record.userId);
        const preferences = user?.status === "active" ? normalizeAccountPreferences(user.preferences) : null;
        if (!preferences || !pushAllowed(preferences, record.type) || reminderTooLate(record, now)) {
          await notifications.setPushStatus(record.id, "skipped");
          skipped += 1;
          continue;
        }
      }
      const remaining = room.get(record.userId) ?? maxPushesPerUser;
      if (remaining <= 0) continue;
      let added = 0;
      let retryLater = false;
      for (const token of tokens) {
        const attempts = await pushTokens.attemptsFor(record.id, token.id);
        if (attempts.length >= input.policy.maxAttempts) continue;
        const latest = attempts[attempts.length - 1];
        if (latest && now.getTime() < latest.createdAt.getTime() + retryDelayMs(attempts.length)) {
          retryLater = true;
          continue;
        }
        if (added >= remaining || work.length >= input.policy.batchSize) {
          retryLater = true;
          continue;
        }
        work.push({ notification: record, token, attempt: attempts.length + 1 });
        added += 1;
      }
      room.set(record.userId, remaining - added);
      if (added === 0 && !retryLater) {
        await notifications.setPushStatus(record.id, "failed");
        failed += 1;
      }
    }

    const tickets = await readTickets({
      messages: work.map(messageFor),
      accessToken: input.accessToken ?? null,
      fetchImpl: input.fetchImpl ?? fetch,
    });
    const touched = new Set<string>();
    for (let index = 0; index < work.length; index += 1) {
      const item = work[index];
      const ticket = tickets[index] ?? { status: "retry", code: "unavailable" };
      touched.add(item.notification.id);
      if (ticket.status === "invalid") {
        await pushTokens.save({ ...item.token, status: "invalid", invalidAt: now });
        invalidTokens += 1;
      }
      await pushTokens.recordAttempt({
        id: createAccountId(),
        notificationId: item.notification.id,
        tokenId: item.token.id,
        userId: item.notification.userId,
        attempt: item.attempt,
        status: ticket.status === "sent" ? "sent" : ticket.status === "invalid" ? "invalid-token" : "failed",
        providerError: ticket.status === "sent" ? null : ticket.code,
        ticketId: ticket.status === "sent" ? ticket.ticketId : null,
        receiptCheckedAt: null,
        createdAt: now,
      });
    }

    for (const id of touched) {
      const record = work.find((item) => item.notification.id === id)?.notification;
      if (!record) continue;
      const sentTicket = work.some((item, index) => item.notification.id === id && tickets[index]?.status === "sent");
      if (sentTicket) {
        await notifications.setPushStatus(id, "sent");
        sent += 1;
        continue;
      }
      const active = await pushTokens.listActive(record.userId);
      let retryable = false;
      for (const token of active) {
        const attempts = await pushTokens.attemptsFor(id, token.id);
        if (attempts.length < input.policy.maxAttempts) retryable = true;
      }
      if (!retryable) {
        await notifications.setPushStatus(id, "failed");
        failed += 1;
      }
    }

    return finishDelivery("ran", { examined, sent, failed, skipped, invalidTokens });
  } finally {
    await release();
  }
}

/**
 * Polls Expo push receipts for previously accepted tickets and invalidates rejected tokens.
 * Does not invent delivery success when a receipt is still pending.
 */
export async function runPushReceiptCheck(input: {
  database: DatabaseHandle;
  locks: SyncLock;
  policy: AlertPolicy;
  logger: Logger;
  accessToken?: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<PushReceiptResult> {
  const empty = { examined: 0, confirmed: 0, invalidTokens: 0, pending: 0 };
  const finishReceipts = (
    status: PushReceiptResult["status"],
    counts: Omit<PushReceiptResult, "status">,
  ): PushReceiptResult => {
    const finishedAt = new Date().toISOString();
    if (status === "ran") {
      recordPushReceiptMetrics({ ...counts, finishedAt });
    }
    input.logger.info("push_receipts", { status, ...counts });
    return { status, ...counts };
  };
  if (!input.policy.pushDeliveryEnabled) {
    return finishReceipts("disabled", empty);
  }
  const pushTokens = input.database.pushTokens;
  if (!pushTokens) return finishReceipts("unavailable", empty);

  const release = await input.locks.acquire("push-receipts", input.policy.lockMs);
  if (!release) return finishReceipts("locked", empty);

  const now = input.now ?? new Date();
  let examined = 0;
  let confirmed = 0;
  let invalidTokens = 0;
  let pending = 0;
  try {
    const attempts = await pushTokens.listPendingReceipts(input.policy.batchSize);
    examined = attempts.length;
    if (attempts.length === 0) {
      return finishReceipts("ran", { examined, confirmed, invalidTokens, pending });
    }
    const ticketIds = attempts.map((attempt) => attempt.ticketId).filter((id): id is string => typeof id === "string" && id.length > 0);
    const receipts = await readReceipts({
      ticketIds,
      accessToken: input.accessToken ?? null,
      fetchImpl: input.fetchImpl ?? fetch,
    });
    for (const attempt of attempts) {
      if (!attempt.ticketId) {
        await pushTokens.markReceiptChecked(attempt.id, now);
        continue;
      }
      const receipt = receipts.get(attempt.ticketId);
      if (!receipt || receipt.status === "pending") {
        pending += 1;
        continue;
      }
      if (receipt.status === "ok") {
        await pushTokens.markReceiptChecked(attempt.id, now);
        confirmed += 1;
        continue;
      }
      if (receipt.code === "DeviceNotRegistered") {
        const token = await pushTokens.findTokenById(attempt.tokenId);
        if (token && token.status === "active") {
          await pushTokens.save({ ...token, status: "invalid", invalidAt: now });
          invalidTokens += 1;
        }
      }
      await pushTokens.markReceiptChecked(attempt.id, now);
    }
    return finishReceipts("ran", { examined, confirmed, invalidTokens, pending });
  } finally {
    await release();
  }
}

async function readReceipts(input: {
  ticketIds: readonly string[];
  accessToken: string | null;
  fetchImpl: typeof fetch;
}): Promise<Map<string, { status: "ok" | "error" | "pending"; code: string | null }>> {
  const map = new Map<string, { status: "ok" | "error" | "pending"; code: string | null }>();
  if (input.ticketIds.length === 0) return map;
  try {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (input.accessToken) headers.authorization = `Bearer ${input.accessToken}`;
    const response = await input.fetchImpl(expoReceiptUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids: input.ticketIds }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      for (const id of input.ticketIds) map.set(id, { status: "pending", code: null });
      return map;
    }
    const payload: unknown = await response.json();
    const data =
      payload && typeof payload === "object" && "data" in payload && payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : null;
    for (const id of input.ticketIds) {
      const item = data?.[id];
      if (!item || typeof item !== "object") {
        map.set(id, { status: "pending", code: null });
        continue;
      }
      if ("status" in item && item.status === "ok") {
        map.set(id, { status: "ok", code: null });
        continue;
      }
      if ("status" in item && item.status === "error") {
        const details = "details" in item && item.details && typeof item.details === "object" ? item.details : null;
        const code = details && "error" in details && typeof details.error === "string" ? details.error.slice(0, 80) : "error";
        map.set(id, { status: "error", code });
        continue;
      }
      map.set(id, { status: "pending", code: null });
    }
    return map;
  } catch {
    for (const id of input.ticketIds) map.set(id, { status: "pending", code: null });
    return map;
  }
}
