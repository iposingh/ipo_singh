import { publicAccountSchema } from "@ipo-singh/contracts";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { z } from "zod";
import { accountPreferencesPath, createPreferenceController, guestThemeClaim, type PreferenceController } from "../account/preferences";
import { saveAlertPreferences as saveStoredAlertPreferences } from "../notifications/controller";
import { claimAnonymousPushForAccount, readOrCreateInstallationId, revokeStoredPushToken } from "../notifications/push-native";
import { createAuthSession, type AccountSnapshot, type AuthClient, type AuthResult, type AuthSession } from "../auth/session";
import { deviceSecretStore } from "../auth/secure-store";
import { readCatalogueTarget } from "../screens/catalogue-target";
import { useTheme } from "../theme/provider";

type AuthView =
  | { phase: "loading" }
  | { phase: "signed-out"; notice: string | null }
  | { phase: "offline"; notice: string }
  | { phase: "ready"; snapshot: AccountSnapshot; notice: string | null };

type AuthContextValue = {
  state: AuthView;
  register: (input: { email: string; password: string; displayName?: string }) => Promise<string | null>;
  login: (input: { email: string; password: string }) => Promise<string | null>;
  logout: (allDevices: boolean) => Promise<void>;
  saveDisplayName: (displayName: string | null) => Promise<string | null>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<string | null>;
  revoke: (sessionId: string) => Promise<string | null>;
  deleteAccount: (input: { password: string }) => Promise<string | null>;
  retry: () => Promise<void>;
  call: AuthSession["authorized"];
  savePreferences: (patch: unknown) => Promise<string | null>;
  saveAlertPreferences: (patch: unknown) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const preferenceBodySchema = z.object({ account: publicAccountSchema }).strict();

function nativeClient(): AuthClient | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

function noticeFor(result: AuthResult<unknown>): string | null {
  if (result.status === "ready" || result.status === "offline") return result.status === "offline" ? "This device is offline." : null;
  if (result.status === "signed-out") {
    return result.pendingServer ? "This device is signed out. The server session could not be reached and stays until it expires." : null;
  }
  return result.message;
}

function viewFor(result: AuthResult<AccountSnapshot>): AuthView {
  if (result.status === "ready") return { phase: "ready", snapshot: result.value, notice: null };
  if (result.status === "offline") return { phase: "offline", notice: "A session is saved on this device. Account details load when the connection returns." };
  if (result.status === "signed-out") return { phase: "signed-out", notice: noticeFor(result) };
  return { phase: "signed-out", notice: result.message };
}

async function readInstallationId(): Promise<string | undefined> {
  try {
    return await readOrCreateInstallationId();
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = nativeClient();
  const { choice, setTheme } = useTheme();
  const sessionRef = useRef<AuthSession | null>(null);
  const preferenceRef = useRef<{ userId: string; controller: PreferenceController } | null>(null);
  const [state, setState] = useState<AuthView>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    preferenceRef.current = null;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!client) {
        setState({ phase: "signed-out", notice: "Sign-in is available in the iOS and Android app." });
        return;
      }
      const target = await readCatalogueTarget();
      if (!active) return;
      if ("error" in target) {
        setState({ phase: "signed-out", notice: target.error });
        return;
      }
      const session = createAuthSession({
        store: deviceSecretStore(),
        origin: target.origin,
        client,
        offline: target.offline,
      });
      sessionRef.current = session;
      const restored = await session.restore();
      if (!active) return;
      setState(viewFor(restored));
      if (restored.status === "ready") setTheme(restored.value.account.preferences.colorScheme);
    })();
    return () => {
      active = false;
    };
  }, [attempt, client, setTheme]);

  const value = useMemo<AuthContextValue>(() => {
    async function withSession<T>(run: (session: AuthSession) => Promise<AuthResult<T>>): Promise<AuthResult<T>> {
      const session = sessionRef.current;
      if (!session) return { status: "unavailable", message: "Sign-in is available in the iOS and Android app." };
      const target = await readCatalogueTarget();
      if ("error" in target) return { status: "unavailable", message: target.error };
      session.setTarget(target);
      return run(session);
    }

    async function afterSignIn(snapshot: AccountSnapshot): Promise<void> {
      preferenceRef.current = null;
      let next = snapshot;
      const claim = guestThemeClaim(snapshot.account.preferences.colorScheme, choice);
      if (claim) {
        const updated = await withSession((session) =>
          session.authorized({
            path: accountPreferencesPath,
            schema: preferenceBodySchema,
            method: "PATCH",
            body: claim,
          }),
        );
        if (updated.status === "ready") {
          next = { ...snapshot, account: updated.value.account };
        }
      }
      setState({ phase: "ready", snapshot: next, notice: null });
      setTheme(next.account.preferences.colorScheme);
      void claimAnonymousPushForAccount((input) => withSession((session) => session.authorized(input)));
    }

    return {
      state,
      async register(input) {
        const installationId = await readInstallationId();
        const result = await withSession((session) => session.register({ ...input, installationId }));
        if (result.status === "ready") {
          await afterSignIn(result.value);
          return null;
        }
        return noticeFor(result);
      },
      async login(input) {
        const installationId = await readInstallationId();
        const result = await withSession((session) => session.login({ ...input, installationId }));
        if (result.status === "ready") {
          await afterSignIn(result.value);
          return null;
        }
        return noticeFor(result);
      },
      async logout(allDevices) {
        try {
          await revokeStoredPushToken((input) => withSession((session) => session.authorized(input)));
        } catch {
          // Sign-out continues. The server also revokes the device token when logout reaches it.
        }
        const result = await withSession((session) => session.logout(allDevices));
        if (result.status === "signed-out") {
          preferenceRef.current = null;
          setState({ phase: "signed-out", notice: noticeFor(result) });
          return;
        }
        const notice = noticeFor(result);
        setState((current) => {
          if (current.phase === "ready") return { phase: "ready", snapshot: current.snapshot, notice: notice ?? current.notice };
          if (current.phase === "offline") return { phase: "offline", notice: notice ?? current.notice };
          return { phase: "signed-out", notice };
        });
      },
      async saveDisplayName(displayName) {
        const result = await withSession((session) => session.updateDisplayName(displayName));
        if (result.status === "ready") setState({ phase: "ready", snapshot: result.value, notice: "Display name saved." });
        return result.status === "ready" ? null : noticeFor(result);
      },
      async changePassword(input) {
        const result = await withSession((session) => session.changePassword(input));
        if (result.status === "ready") setState({ phase: "ready", snapshot: result.value, notice: "Password saved. Other sessions were signed out." });
        return result.status === "ready" ? null : noticeFor(result);
      },
      async revoke(sessionId) {
        const result = await withSession((session) => session.revokeSession(sessionId));
        if (result.status === "ready") setState({ phase: "ready", snapshot: result.value, notice: "That session was signed out." });
        return result.status === "ready" ? null : noticeFor(result);
      },
      async deleteAccount(input) {
        try {
          await revokeStoredPushToken((payload) => withSession((session) => session.authorized(payload)));
        } catch {
          // Account deletion continues; the API also revokes push tokens for the user.
        }
        const result = await withSession((session) => session.deleteAccount(input));
        if (result.status === "signed-out") {
          preferenceRef.current = null;
          setState({ phase: "signed-out", notice: "Your account was closed on this device." });
          return null;
        }
        return noticeFor(result);
      },
      async retry() {
        setAttempt((value) => value + 1);
      },
      async call(input) {
        const result = await withSession((session) => session.authorized(input));
        if (result.status === "signed-out") {
          preferenceRef.current = null;
          setState({ phase: "signed-out", notice: noticeFor(result) });
        }
        return result;
      },
      async savePreferences(patch) {
        if (state.phase !== "ready") return "Sign in to save preferences.";
        const accountId = state.snapshot.account.id;
        if (!preferenceRef.current || preferenceRef.current.userId !== accountId) {
          preferenceRef.current = {
            userId: accountId,
            controller: createPreferenceController(
              (input) => withSession((session) => session.authorized(input)),
              state.snapshot.account.preferences,
            ),
          };
        }
        const result = await preferenceRef.current.controller.update(patch);
        if (result.status === "ready") {
          const account = result.value;
          setState((current) => (current.phase === "ready" ? { phase: "ready", snapshot: { ...current.snapshot, account }, notice: null } : current));
          setTheme(account.preferences.colorScheme);
          return null;
        }
        if (result.status === "signed-out") {
          preferenceRef.current = null;
          setState({ phase: "signed-out", notice: noticeFor(result) });
          return "Sign in to save preferences.";
        }
        if (result.status === "offline") return "Preferences could not be saved while offline.";
        return result.message;
      },
      async saveAlertPreferences(patch) {
        if (state.phase !== "ready") return "Sign in to save notification preferences.";
        const result = await withSession((session) => saveStoredAlertPreferences((input) => session.authorized(input), patch));
        if (result.status === "ready") {
          const account = result.value;
          setState((current) => (current.phase === "ready" ? { phase: "ready", snapshot: { ...current.snapshot, account }, notice: null } : current));
          return null;
        }
        if (result.status === "signed-out") {
          preferenceRef.current = null;
          setState({ phase: "signed-out", notice: noticeFor(result) });
          return "Sign in to save notification preferences.";
        }
        if (result.status === "offline") return "Notification preferences could not be saved while offline.";
        return result.message;
      },
    };
  }, [choice, setTheme, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Account session is unavailable.");
  return value;
}
