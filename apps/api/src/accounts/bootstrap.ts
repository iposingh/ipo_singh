import { accountEmailSchema, accountPasswordIssue, defaultAccountPreferences } from "@ipo-singh/contracts";
import { ConfigError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import type { AdminAuditStore } from "./audit.ts";
import type { PasswordHasher } from "./passwords.ts";
import type { AccountStore, UserRecord } from "./records.ts";
import { createAccountId } from "./tokens.ts";

export const bootstrapAdminEmailEnv = "IPO_SINGH_BOOTSTRAP_ADMIN_EMAIL";
export const bootstrapAdminPasswordEnv = "IPO_SINGH_BOOTSTRAP_ADMIN_PASSWORD";

export type BootstrapResult = "created" | "present" | "skipped";

type BootstrapInput = {
  email: string;
  password: string;
};

function readValue(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value : "";
}

/** Returns null when both variables are unset. A partial or weak value fails startup without echoing the secret. */
export function readBootstrapAdmin(env: Record<string, string | undefined>): BootstrapInput | null {
  const email = readValue(env, bootstrapAdminEmailEnv).trim();
  const password = readValue(env, bootstrapAdminPasswordEnv);
  if (!email && !password) return null;
  if (!email || !password) throw new ConfigError([email ? bootstrapAdminPasswordEnv : bootstrapAdminEmailEnv]);
  const parsedEmail = accountEmailSchema.safeParse(email);
  if (!parsedEmail.success) throw new ConfigError([bootstrapAdminEmailEnv]);
  if (accountPasswordIssue(password, parsedEmail.data)) throw new ConfigError([bootstrapAdminPasswordEnv]);
  return { email: parsedEmail.data, password };
}

/**
 * Creates the first super admin from the environment.
 * An existing super admin is left unchanged. A public account is never promoted.
 */
export async function bootstrapSuperAdmin(input: {
  store: AccountStore;
  audit?: AdminAuditStore;
  hasher: PasswordHasher;
  env: Record<string, string | undefined>;
  logger: Logger;
  now?: Date;
}): Promise<BootstrapResult> {
  const credentials = readBootstrapAdmin(input.env);
  if (!credentials) return "skipped";
  if ((await input.store.countRole("super-admin")) > 0) {
    input.logger.info("admin_bootstrap", { outcome: "present" });
    return "present";
  }
  const existing = await input.store.findUserByEmail(credentials.email);
  if (existing) {
    input.logger.warn("admin_bootstrap", { outcome: "skipped", reason: "email_in_use" });
    return "skipped";
  }

  const now = input.now ?? new Date();
  const user: UserRecord = {
    id: createAccountId(),
    email: credentials.email,
    displayName: null,
    status: "active",
    role: "super-admin",
    preferences: defaultAccountPreferences,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    lastAuthenticatedAt: null,
    suspendedAt: null,
    closedAt: null,
    passwordHash: await input.hasher.hash(credentials.password),
  };
  await input.store.insertUser(user);
  if (input.audit) {
    await input.audit.insert({
      id: createAccountId(),
      actorUserId: user.id,
      action: "bootstrap",
      outcome: "succeeded",
      targetUserId: user.id,
      createdAt: now,
    });
  }
  input.logger.info("admin_bootstrap", { outcome: "created", userId: user.id });
  return "created";
}
