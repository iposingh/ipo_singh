import {
  accountPreferencesSchema,
  publicAccountSchema,
  updateAccountPreferencesSchema,
  type AccountPreferences,
  type PublicAccount,
} from "@ipo-singh/contracts";
import { z } from "zod";
import type { AuthResult, AuthSession } from "../auth/session.ts";

export const accountPreferencesPath = "/api/v1/auth/preferences";

const preferenceBodySchema = z.object({ account: publicAccountSchema }).strict();

export const notificationCategoryOptions = [
  { key: "open", label: "IPO opening reminders", primary: true },
  { key: "closing", label: "IPO closing reminders", primary: true },
  { key: "allotment", label: "Allotment results", primary: true },
  { key: "listing", label: "Listing updates", primary: true },
  { key: "gmp", label: "GMP changes", primary: false },
  { key: "subscription", label: "Subscription milestones", primary: false },
  { key: "schedule", label: "Schedule changes", primary: false },
  { key: "announcement", label: "IPO Singh announcements", primary: false },
] as const satisfies readonly { key: keyof AccountPreferences["notificationCategories"]; label: string; primary: boolean }[];

/** Opening, closing, allotment results, and listing — the core reminder set. */
export const primaryNotificationCategoryKeys = notificationCategoryOptions.filter((option) => option.primary).map((option) => option.key);

type AccountCaller = AuthSession["authorized"];

export function applyPreferencePatch(
  current: AccountPreferences,
  patch: z.infer<typeof updateAccountPreferencesSchema>,
): AccountPreferences {
  return accountPreferencesSchema.parse({
    ...current,
    ...patch,
    timeZone: "Asia/Kolkata",
    notificationCategories: {
      ...current.notificationCategories,
      ...patch.notificationCategories,
    },
    watchlistDisplay: {
      ...current.watchlistDisplay,
      ...patch.watchlistDisplay,
    },
  });
}

/** A signed-in theme change is stored on the account. A guest change stays on the device. */
export function themePatchForAccount(
  phase: "loading" | "signed-out" | "offline" | "ready",
  colorScheme: AccountPreferences["colorScheme"],
): { colorScheme: AccountPreferences["colorScheme"] } | null {
  if (phase !== "ready") return null;
  return { colorScheme };
}

/**
 * Safe guest→account theme claim. Uploads only when the account still has the default
 * `system` preference and the device already chose light or dark. Never overwrites a
 * website or prior account theme choice.
 */
export function guestThemeClaim(
  accountScheme: AccountPreferences["colorScheme"],
  deviceScheme: AccountPreferences["colorScheme"],
): { colorScheme: AccountPreferences["colorScheme"] } | null {
  if (accountScheme !== "system") return null;
  if (deviceScheme === "system") return null;
  return { colorScheme: deviceScheme };
}

export function preferenceStatusMessage(
  status: AuthResult<unknown>["status"],
  message?: string,
): string | null {
  if (status === "ready") return null;
  if (status === "offline") return "Preferences could not be saved while offline.";
  if (status === "signed-out") return "Sign in to save preferences.";
  return message ?? "Preferences could not be saved.";
}

export type PreferenceController = {
  current(): AccountPreferences;
  update(patch: unknown): Promise<AuthResult<PublicAccount>>;
};

export function createPreferenceController(call: AccountCaller, initial: AccountPreferences): PreferenceController {
  let current = accountPreferencesSchema.parse(initial);
  let chain = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    current: () => current,
    update(patch) {
      return enqueue(async () => {
        const parsed = updateAccountPreferencesSchema.safeParse(patch);
        if (!parsed.success) return { status: "rejected", message: "Those preferences are not valid." };
        const previous = current;
        current = applyPreferencePatch(current, parsed.data);
        const result = await call({
          path: accountPreferencesPath,
          schema: preferenceBodySchema,
          method: "PATCH",
          body: parsed.data,
        });
        if (result.status !== "ready") {
          current = previous;
          return result;
        }
        current = result.value.account.preferences;
        return { status: "ready", value: result.value.account };
      });
    },
  };
}
