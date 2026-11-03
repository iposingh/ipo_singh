import {
  accountSessionResponseSchema,
  mobileAuthClientHeader,
  mobileSessionGrantSchema,
  publicAccountSchema,
} from "@ipo-singh/contracts";
import { z } from "zod";
import { requestJson } from "../api/client.ts";
import { MobileApiError } from "../api/errors.ts";
import { clearSavedCredentials, readSavedCredentials, writeSavedCredentials, type SavedCredentials, type SecretStore } from "./secrets.ts";

const accountBodySchema = z.object({ account: publicAccountSchema }).strict();
const emptySchema = z.null();

export type AuthClient = "ios" | "android";

export type AccountSnapshot = z.infer<typeof accountSessionResponseSchema>;

export type AuthResult<T> =
  | { status: "ready"; value: T }
  | { status: "signed-out"; pendingServer: boolean }
  | { status: "offline" }
  | { status: "rejected"; message: string }
  | { status: "limited"; message: string }
  | { status: "unavailable"; message: string };

export type AuthSession = {
  setTarget(target: { origin: string; offline: boolean }): void;
  restore(): Promise<AuthResult<AccountSnapshot>>;
  register(input: { email: string; password: string; displayName?: string; installationId?: string }): Promise<AuthResult<AccountSnapshot>>;
  login(input: { email: string; password: string; installationId?: string }): Promise<AuthResult<AccountSnapshot>>;
  logout(allDevices: boolean): Promise<AuthResult<null>>;
  updateDisplayName(displayName: string | null): Promise<AuthResult<AccountSnapshot>>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<AuthResult<AccountSnapshot>>;
  revokeSession(sessionId: string): Promise<AuthResult<AccountSnapshot>>;
  deleteAccount(input: { password: string }): Promise<AuthResult<null>>;
  authorized<T>(input: { path: string; schema: z.ZodType<T>; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }): Promise<AuthResult<T>>;
};

function failure(error: unknown): Exclude<AuthResult<never>, { status: "signed-out" }> {
  if (error instanceof MobileApiError) {
    if (error.status === 429) return { status: "limited", message: error.message };
    if (error.status === 401 || error.status === 400 || error.status === 403 || error.status === 404) {
      return { status: "rejected", message: error.message };
    }
    if (error.kind === "network" || error.kind === "timeout") return { status: "offline" };
    return { status: "unavailable", message: error.message };
  }
  return { status: "offline" };
}

export function createAuthSession(input: {
  store: SecretStore;
  origin: string;
  client: AuthClient;
  offline?: boolean;
  fetchImpl?: typeof fetch;
}): AuthSession {
  let origin = input.origin;
  let offline = input.offline ?? false;
  let flight: Promise<AuthResult<SavedCredentials>> | null = null;

  async function send<T>(path: string, schema: z.ZodType<T>, method: "GET" | "POST" | "PATCH" | "DELETE", body: unknown, accessToken: string | null): Promise<T> {
    const headers: Record<string, string> = { [mobileAuthClientHeader]: input.client };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return requestJson({ origin, path, schema, method, body, headers, fetchImpl: input.fetchImpl });
  }

  async function refreshOnce(): Promise<AuthResult<SavedCredentials>> {
    const saved = await readSavedCredentials(input.store);
    if (!saved) return { status: "signed-out", pendingServer: false };
    if (offline) return { status: "offline" };
    try {
      const grant = await send("/api/v1/auth/refresh", mobileSessionGrantSchema, "POST", { refreshToken: saved.refreshToken }, null);
      const written = await writeSavedCredentials(input.store, grant);
      const kept = await readSavedCredentials(input.store);
      if (written !== "saved") {
        if (kept?.refreshToken === grant.refreshToken) return { status: "ready", value: kept };
        await clearSavedCredentials(input.store);
        return { status: "signed-out", pendingServer: false };
      }
      return { status: "ready", value: { accessToken: grant.accessToken, refreshToken: grant.refreshToken } };
    } catch (error) {
      if (error instanceof MobileApiError && (error.status === 401 || error.kind === "malformed")) {
        await clearSavedCredentials(input.store);
        return { status: "signed-out", pendingServer: false };
      }
      return failure(error);
    }
  }

  function refreshShared(): Promise<AuthResult<SavedCredentials>> {
    flight ??= refreshOnce().finally(() => {
      flight = null;
    });
    return flight;
  }

  async function currentAccess(): Promise<AuthResult<string>> {
    const saved = await readSavedCredentials(input.store);
    if (!saved) return { status: "signed-out", pendingServer: false };
    if (saved.accessToken) return { status: "ready", value: saved.accessToken };
    const refreshed = await refreshShared();
    if (refreshed.status !== "ready" || !refreshed.value.accessToken) {
      return refreshed.status === "ready" ? { status: "signed-out", pendingServer: false } : refreshed;
    }
    return { status: "ready", value: refreshed.value.accessToken };
  }

  async function authorized<T>(request: { path: string; schema: z.ZodType<T>; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }): Promise<AuthResult<T>> {
    if (offline) return { status: "offline" };
    const access = await currentAccess();
    if (access.status !== "ready") return access;
    const method = request.method ?? "GET";
    try {
      return { status: "ready", value: await send(request.path, request.schema, method, request.body, access.value) };
    } catch (error) {
      if (!(error instanceof MobileApiError) || error.status !== 401) return failure(error);
      const refreshed = await refreshShared();
      if (refreshed.status !== "ready" || !refreshed.value.accessToken) {
        return refreshed.status === "ready" ? { status: "signed-out", pendingServer: false } : refreshed;
      }
      try {
        return { status: "ready", value: await send(request.path, request.schema, method, request.body, refreshed.value.accessToken) };
      } catch (retryError) {
        if (retryError instanceof MobileApiError && retryError.status === 401) {
          await clearSavedCredentials(input.store);
          return { status: "signed-out", pendingServer: false };
        }
        return failure(retryError);
      }
    }
  }

  async function loadSnapshot(): Promise<AuthResult<AccountSnapshot>> {
    return authorized({ path: "/api/v1/auth/session", schema: accountSessionResponseSchema });
  }

  async function openWithPassword(path: "/api/v1/auth/login" | "/api/v1/auth/register", body: unknown): Promise<AuthResult<AccountSnapshot>> {
    if (offline) return { status: "offline" };
    try {
      const grant = await send(path, mobileSessionGrantSchema, "POST", body, null);
      const written = await writeSavedCredentials(input.store, grant);
      if (written !== "saved") {
        await clearSavedCredentials(input.store);
        return { status: "unavailable", message: "The session could not be saved on this device." };
      }
      return loadSnapshot();
    } catch (error) {
      return failure(error);
    }
  }

  return {
    setTarget(target) {
      origin = target.origin;
      offline = target.offline;
    },
    restore() {
      return readSavedCredentials(input.store).then((saved) => {
        if (!saved) return { status: "signed-out", pendingServer: false };
        if (offline) return { status: "offline" };
        return loadSnapshot();
      });
    },
    register(values) {
      const body: { email: string; password: string; displayName?: string; installationId?: string } = {
        email: values.email,
        password: values.password,
      };
      if (values.displayName) body.displayName = values.displayName;
      if (values.installationId) body.installationId = values.installationId;
      return openWithPassword("/api/v1/auth/register", body);
    },
    login(values) {
      const body: { email: string; password: string; installationId?: string } = {
        email: values.email,
        password: values.password,
      };
      if (values.installationId) body.installationId = values.installationId;
      return openWithPassword("/api/v1/auth/login", body);
    },
    async logout(allDevices) {
      const saved = await readSavedCredentials(input.store);
      let pendingServer = Boolean(saved) && offline;
      if (saved?.accessToken && !offline) {
        try {
          await send(allDevices ? "/api/v1/auth/logout-all" : "/api/v1/auth/logout", emptySchema, "POST", undefined, saved.accessToken);
        } catch (error) {
          pendingServer = !(error instanceof MobileApiError && error.status === 401);
        }
      }
      await clearSavedCredentials(input.store);
      return { status: "signed-out", pendingServer };
    },
    async updateDisplayName(displayName) {
      const updated = await authorized({ path: "/api/v1/auth/profile", schema: accountBodySchema, method: "PATCH", body: { displayName } });
      if (updated.status !== "ready") return updated;
      return loadSnapshot();
    },
    async changePassword(values) {
      const updated = await authorized({ path: "/api/v1/auth/password", schema: accountBodySchema, method: "POST", body: values });
      if (updated.status !== "ready") return updated;
      return loadSnapshot();
    },
    revokeSession(sessionId) {
      return authorized({ path: "/api/v1/auth/sessions/revoke", schema: accountSessionResponseSchema, method: "POST", body: { sessionId } });
    },
    async deleteAccount(values) {
      const result = await authorized({
        path: "/api/v1/auth/account/delete",
        schema: emptySchema,
        method: "POST",
        body: { password: values.password, confirmation: "DELETE" },
      });
      if (result.status === "ready") {
        await clearSavedCredentials(input.store);
        return { status: "signed-out", pendingServer: false };
      }
      return result;
    },
    authorized,
  };
}
