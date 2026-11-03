import { mobileSecureStoreKeys } from "@ipo-singh/contracts";

export type SecretStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type SavedCredentials = {
  accessToken: string | null;
  refreshToken: string;
};

const allowed = new Set<string>([mobileSecureStoreKeys.access, mobileSecureStoreKeys.refresh]);
const tokenPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function assertSecretKey(key: string): void {
  if (!allowed.has(key)) throw new Error("That value cannot be stored.");
}

export function createMemorySecretStore(): SecretStore & { records(): Record<string, string> } {
  const values = new Map<string, string>();
  return {
    async get(key) {
      assertSecretKey(key);
      return values.get(key) ?? null;
    },
    async set(key, value) {
      assertSecretKey(key);
      if (!tokenPattern.test(value)) throw new Error("That value cannot be stored.");
      values.set(key, value);
    },
    async delete(key) {
      assertSecretKey(key);
      values.delete(key);
    },
    records() {
      return Object.fromEntries(values);
    },
  };
}

export async function readSavedCredentials(store: SecretStore): Promise<SavedCredentials | null> {
  const refreshToken = await store.get(mobileSecureStoreKeys.refresh);
  if (!refreshToken) return null;
  return { accessToken: await store.get(mobileSecureStoreKeys.access), refreshToken };
}

export async function writeSavedCredentials(
  store: SecretStore,
  credentials: { accessToken: string; refreshToken: string },
): Promise<"saved" | "failed"> {
  try {
    await store.set(mobileSecureStoreKeys.refresh, credentials.refreshToken);
  } catch {
    await clearSavedCredentials(store);
    return "failed";
  }
  try {
    await store.set(mobileSecureStoreKeys.access, credentials.accessToken);
  } catch {
    return "failed";
  }
  return "saved";
}

export async function clearSavedCredentials(store: SecretStore): Promise<void> {
  await store.delete(mobileSecureStoreKeys.access);
  await store.delete(mobileSecureStoreKeys.refresh);
}
