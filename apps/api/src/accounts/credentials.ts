import { accountEmailSchema, accountPasswordIssue, defaultAccountPreferences } from "@ipo-singh/contracts";
import { AccountStateError } from "./session-service.ts";
import type { PasswordHasher } from "./passwords.ts";
import type { AccountStore, UserRecord } from "./records.ts";
import { createAccountId } from "./tokens.ts";

export class PasswordPolicyError extends Error {
  readonly messageText: string;

  constructor(messageText: string) {
    super("password");
    this.name = "PasswordPolicyError";
    this.messageText = messageText;
  }
}

function cleanDisplayName(value: string | null | undefined): string | null {
  const name = value?.trim() ?? "";
  return name ? name.slice(0, 80) : null;
}

async function spendHash(hasher: PasswordHasher, password: string): Promise<void> {
  await hasher.hash(password);
}

export async function registerPasswordAccount(
  store: AccountStore,
  hasher: PasswordHasher,
  input: { email: string; password: string; displayName?: string | null },
  now = new Date(),
): Promise<UserRecord> {
  const email = accountEmailSchema.safeParse(input.email);
  if (!email.success) throw new AccountStateError("invalid");
  const issue = accountPasswordIssue(input.password, email.data);
  if (issue) throw new PasswordPolicyError(issue);
  const passwordHash = await hasher.hash(input.password);
  if (await store.findUserByEmail(email.data)) throw new AccountStateError("duplicate");
  const user: UserRecord = {
    id: createAccountId(),
    email: email.data,
    displayName: cleanDisplayName(input.displayName),
    status: "active",
    role: "member",
    preferences: defaultAccountPreferences,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: null,
    suspendedAt: null,
    closedAt: null,
    passwordHash,
  };
  try {
    await store.insertUser(user);
  } catch (error) {
    if (error instanceof Error && error.message.includes("email")) throw new AccountStateError("duplicate");
    throw error;
  }
  return user;
}

export type LoginResult = { status: "ok"; user: UserRecord } | { status: "rejected" };

/**
 * Wrong password, unknown email, and a closed or suspended account share one result.
 * A hash still runs when the account cannot be checked, so the response time stays similar.
 */
export async function verifyLogin(
  store: AccountStore,
  hasher: PasswordHasher,
  input: { email: string; password: string },
): Promise<LoginResult> {
  const email = accountEmailSchema.safeParse(input.email);
  const user = email.success ? await store.findUserByEmail(email.data) : null;
  if (!user?.passwordHash || user.status !== "active") {
    await spendHash(hasher, input.password);
    return { status: "rejected" };
  }
  const matches = await hasher.verify(input.password, user.passwordHash);
  if (!matches) return { status: "rejected" };
  return { status: "ok", user };
}
