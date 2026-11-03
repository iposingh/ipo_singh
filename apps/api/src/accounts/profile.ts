import {
  accountPasswordIssue,
  accountPreferencesSchema,
  defaultAccountPreferences,
  updateAccountPreferencesSchema,
  type AccountPreferences,
} from "@ipo-singh/contracts";
import { PasswordPolicyError } from "./credentials.ts";
import type { PasswordHasher } from "./passwords.ts";
import type { AccountStore, UserRecord } from "./records.ts";
import { AccountStateError, closeUser, normalizeAccountPreferences } from "./session-service.ts";

export function mergeAccountPreferences(current: AccountPreferences, patch: unknown): AccountPreferences {
  const parsed = updateAccountPreferencesSchema.safeParse(patch);
  if (!parsed.success) throw new AccountStateError("invalid");
  const next = accountPreferencesSchema.safeParse({
    ...normalizeAccountPreferences(current),
    ...parsed.data,
    timeZone: "Asia/Kolkata",
    notificationCategories: {
      ...normalizeAccountPreferences(current).notificationCategories,
      ...parsed.data.notificationCategories,
    },
    watchlistDisplay: {
      ...normalizeAccountPreferences(current).watchlistDisplay,
      ...parsed.data.watchlistDisplay,
    },
  });
  if (!next.success) throw new AccountStateError("invalid");
  return next.data;
}

export async function updateDisplayName(
  store: AccountStore,
  userId: string,
  displayName: string | null,
  now = new Date(),
): Promise<UserRecord> {
  const user = await store.findUser(userId);
  if (!user || user.status !== "active") throw new AccountStateError("missing");
  const next = { ...user, displayName, updatedAt: now };
  await store.saveUser(next);
  return next;
}

export async function updatePreferences(
  store: AccountStore,
  userId: string,
  patch: unknown,
  now = new Date(),
): Promise<UserRecord> {
  const user = await store.findUser(userId);
  if (!user || user.status !== "active") throw new AccountStateError("missing");
  const preferences = mergeAccountPreferences(user.preferences ?? defaultAccountPreferences, patch);
  const next = { ...user, preferences, updatedAt: now };
  await store.saveUser(next);
  return next;
}

export async function changePassword(
  store: AccountStore,
  hasher: PasswordHasher,
  input: { userId: string; sessionId: string; currentPassword: string; newPassword: string },
  now = new Date(),
): Promise<UserRecord> {
  const user = await store.findUser(input.userId);
  if (!user?.passwordHash || user.status !== "active") throw new AccountStateError("invalid");
  const matches = await hasher.verify(input.currentPassword, user.passwordHash);
  if (!matches) throw new AccountStateError("invalid");
  const issue = accountPasswordIssue(input.newPassword, user.email ?? undefined);
  if (issue) throw new PasswordPolicyError(issue);
  if (await hasher.verify(input.newPassword, user.passwordHash)) throw new PasswordPolicyError("Choose a different password.");
  const passwordHash = await hasher.hash(input.newPassword);
  const next = { ...user, passwordHash, updatedAt: now };
  await store.saveUser(next);
  await store.revokeSessionsForUserExcept(user.id, input.sessionId, now, "user");
  return next;
}

export async function revokeOwnedSession(
  store: AccountStore,
  input: { userId: string; sessionId: string; currentSessionId: string },
  now = new Date(),
): Promise<"current" | "missing" | "revoked"> {
  if (input.sessionId === input.currentSessionId) return "current";
  const session = await store.findSessionById(input.sessionId);
  if (!session || session.userId !== input.userId) return "missing";
  if (!session.revokedAt) {
    await store.saveSession({ ...session, revokedAt: now, revokeReason: "user" });
  }
  return "revoked";
}

/**
 * Member-initiated account close. Requires the current password.
 * Closes the account and revokes every session. Callers clear watchlists and push tokens.
 */
export async function closeOwnAccount(
  store: AccountStore,
  hasher: PasswordHasher,
  input: { userId: string; password: string },
  now = new Date(),
): Promise<UserRecord> {
  const user = await store.findUser(input.userId);
  if (!user?.passwordHash || user.status !== "active") throw new AccountStateError("invalid");
  const matches = await hasher.verify(input.password, user.passwordHash);
  if (!matches) throw new AccountStateError("invalid");
  return closeUser(store, user.id, now);
}
