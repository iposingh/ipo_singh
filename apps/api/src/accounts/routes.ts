import {
  accessTokenTtlMs,
  accountEmailSchema,
  accountPasswordIssue,
  accountSessionResponseSchema,
  authCookieNames,
  changePasswordSchema,
  mobileAuthClientHeader,
  mobileRefreshRequestSchema,
  mobileSessionGrantSchema,
  publicAccountSchema,
  refreshTokenTtlMs,
  revokeSessionRequestSchema,
  updateDisplayNameSchema,
  type AccountClient,
  type PublicAccount,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import type { LoginAttemptLimiter } from "./attempts.ts";
import { sessionCookieHeaders, clearSessionCookieHeaders, readCookie } from "./cookies.ts";
import { PasswordPolicyError, registerPasswordAccount, verifyLogin } from "./credentials.ts";
import type { PasswordHasher } from "./passwords.ts";
import type { AccountStore } from "./records.ts";
import { changePassword, closeOwnAccount, revokeOwnedSession, updateDisplayName, updatePreferences } from "./profile.ts";
import { AccountStateError, issueSession, registerDevice, revokeSession, rotateSession, toPublicAccount, toPublicDevice, toPublicSession, type IssuedSession } from "./session-service.ts";
import { requireAccount } from "./middleware.ts";
import type { PushTokenRevocation } from "../notifications/push-records.ts";

const installationIdField = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  .optional();

const registerBodySchema = z
  .object({
    email: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128),
    displayName: z.string().trim().min(1).max(80).optional(),
    installationId: installationIdField,
  })
  .strict();

const loginBodySchema = z
  .object({
    email: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128),
    installationId: installationIdField,
  })
  .strict();

const accountResponseSchema = z.object({ account: publicAccountSchema }).strict();

const loginRejected = "Email or password is incorrect.";
const registerRejected = "Check the email and password and try again.";

const deleteAccountBodySchema = z
  .object({
    password: z.string().min(1).max(128),
    confirmation: z.literal("DELETE"),
  })
  .strict();

export type AuthRouterDeps = {
  readStore: () => AccountStore | undefined;
  hasher: PasswordHasher;
  attempts: LoginAttemptLimiter;
  logger: Logger;
  secureCookies: boolean;
  revokePushTokens?: (input: PushTokenRevocation) => Promise<void>;
  /** Clears member-owned rows (watchlist) before the account is closed. */
  clearAccountData?: (userId: string) => Promise<void>;
};

function clientAddress(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function audit(logger: Logger, event: string, outcome: string, userId: string | null): void {
  logger.info("account_audit", { event, outcome, userId });
}

async function revokePush(deps: AuthRouterDeps, input: PushTokenRevocation): Promise<void> {
  if (!deps.revokePushTokens) return;
  try {
    await deps.revokePushTokens(input);
  } catch (error: unknown) {
    deps.logger.error("Push token revocation failed", { name: error instanceof Error ? error.name : "Error" });
  }
}

function applyCookies(res: Response, values: { accessToken: string; refreshToken: string; csrfToken: string }, secure: boolean): void {
  for (const header of sessionCookieHeaders(
    {
      ...values,
      accessMaxAgeSeconds: Math.floor(accessTokenTtlMs / 1000),
      refreshMaxAgeSeconds: Math.floor(refreshTokenTtlMs / 1000),
    },
    secure,
  )) {
    res.append("Set-Cookie", header);
  }
}

function clearCookies(res: Response, secure: boolean): void {
  for (const header of clearSessionCookieHeaders(secure)) {
    res.append("Set-Cookie", header);
  }
}

function accountBody(account: PublicAccount): { account: PublicAccount } {
  return accountResponseSchema.parse({ account });
}

function presentedMobileClient(req: Request): "ios" | "android" | null {
  const value = req.get(mobileAuthClientHeader);
  if (value === "ios" || value === "android") return value;
  return null;
}

function deviceLabel(client: AccountClient): string {
  if (client === "ios") return "iOS";
  if (client === "android") return "Android";
  return "Web browser";
}

function sendIssued(res: Response, issued: IssuedSession, client: AccountClient, status: number, secure: boolean): void {
  applyCookies(res, issued, secure);
  if (client === "web") {
    res.status(status).json(accountBody(toPublicAccount(issued.user)));
    return;
  }
  res.status(status).json(
    mobileSessionGrantSchema.parse({
      account: toPublicAccount(issued.user),
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
    }),
  );
}

function storeOrThrow(readStore: () => AccountStore | undefined): AccountStore {
  const store = readStore();
  if (!store) throw new HttpError(503, "unavailable", "Sign-in is temporarily unavailable.");
  return store;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  router.post("/register", (req, res, next) => {
    void register(req, res, next, deps);
  });
  router.post("/login", (req, res, next) => {
    void login(req, res, next, deps);
  });
  router.get("/session", (req, res, next) => {
    void session(req, res, next, deps);
  });
  router.post("/logout", (req, res, next) => {
    void logout(req, res, next, deps, false);
  });
  router.post("/logout-all", (req, res, next) => {
    void logout(req, res, next, deps, true);
  });
  router.post("/refresh", (req, res, next) => {
    void refresh(req, res, next, deps);
  });
  router.patch("/profile", (req, res, next) => {
    void updateProfile(req, res, next, deps);
  });
  router.patch("/preferences", (req, res, next) => {
    void updatePreferenceRoute(req, res, next, deps);
  });
  router.post("/password", (req, res, next) => {
    void updatePassword(req, res, next, deps);
  });
  router.post("/sessions/revoke", (req, res, next) => {
    void revokeOneSession(req, res, next, deps);
  });
  router.post("/account/delete", (req, res, next) => {
    withAccount(req, res, next, () => deleteAccount(req, res, deps));
  });

  return router;
}

async function register(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const parsed = registerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      audit(deps.logger, "register", "rejected", null);
      throw new HttpError(400, "validation_error", "Request validation failed.", [
        { field: "request", message: registerRejected },
      ]);
    }
    const email = accountEmailSchema.safeParse(parsed.data.email);
    const passwordIssue = accountPasswordIssue(parsed.data.password, email.success ? email.data : parsed.data.email);
    if (!email.success || passwordIssue) {
      audit(deps.logger, "register", "rejected", null);
      throw new HttpError(400, "validation_error", "Request validation failed.", [
        {
          field: email.success ? "password" : "email",
          message: email.success ? (passwordIssue ?? registerRejected) : "Enter a valid email address.",
        },
      ]);
    }
    await store.expireSessions(new Date());
    const user = await registerPasswordAccount(store, deps.hasher, {
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
    });
    const client = presentedMobileClient(req) ?? "web";
    const device = await registerDevice(store, {
      userId: user.id,
      client,
      label: deviceLabel(client),
      installationId: client === "web" ? null : parsed.data.installationId ?? null,
    });
    const issued = await issueSession(store, { userId: user.id, deviceId: device.id });
    audit(deps.logger, "register", "succeeded", issued.user.id);
    sendIssued(res, issued, client, 201, deps.secureCookies);
  } catch (error) {
    if (error instanceof AccountStateError && error.reason === "duplicate") {
      audit(deps.logger, "register", "rejected", null);
      next(new HttpError(400, "validation_error", registerRejected));
      return;
    }
    if (error instanceof PasswordPolicyError) {
      audit(deps.logger, "register", "rejected", null);
      next(new HttpError(400, "validation_error", "Request validation failed.", [{ field: "password", message: error.messageText }]));
      return;
    }
    next(error);
  }
}

async function login(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      audit(deps.logger, "login", "rejected", null);
      throw new HttpError(401, "unauthenticated", loginRejected);
    }
    const attemptKey = deps.attempts.key(clientAddress(req), parsed.data.email);
    if (deps.attempts.isLimited(attemptKey)) {
      audit(deps.logger, "login", "limited", null);
      throw new HttpError(429, "rate_limited", "Too many attempts. Try again shortly.");
    }
    await store.expireSessions(new Date());
    const result = await verifyLogin(store, deps.hasher, parsed.data);
    if (result.status === "rejected") {
      deps.attempts.recordFailure(attemptKey);
      audit(deps.logger, "login", "rejected", null);
      throw new HttpError(401, "unauthenticated", loginRejected);
    }
    deps.attempts.clear(attemptKey);
    const client = presentedMobileClient(req) ?? "web";
    const device = await registerDevice(store, {
      userId: result.user.id,
      client,
      label: deviceLabel(client),
      installationId: client === "web" ? null : parsed.data.installationId ?? null,
    });
    const issued = await issueSession(store, { userId: result.user.id, deviceId: device.id });
    audit(deps.logger, "login", "succeeded", issued.user.id);
    sendIssued(res, issued, client, 200, deps.secureCookies);
  } catch (error) {
    next(error);
  }
}

async function session(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  requireAccount(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    void loadSession(req, res, next, deps);
  });
}

async function loadSession(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const auth = req.auth;
    if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const user = await store.findUser(auth.userId);
    if (!user || user.status !== "active") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const sessions = (await store.listSessionsForUser(user.id)).slice(0, 20);
    const devices = (await store.listDevicesForUser(user.id)).slice(0, 20);
    const body = accountSessionResponseSchema.parse({
      account: toPublicAccount(user),
      sessions: sessions.map((item) => toPublicSession(item, auth.sessionId)),
      devices: devices.map((item) => toPublicDevice(item)),
    });
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

async function logout(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps, allDevices: boolean): Promise<void> {
  requireAccount(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    void finishLogout(req, res, next, deps, allDevices);
  });
}

async function finishLogout(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps, allDevices: boolean): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const auth = req.auth;
    if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    if (allDevices) await store.revokeSessionsForUser(auth.userId, new Date(), "user");
    else await revokeSession(store, auth.sessionId, "user");
    await revokePush(deps, { userId: auth.userId, deviceId: allDevices ? null : auth.deviceId });
    clearCookies(res, deps.secureCookies);
    audit(deps.logger, allDevices ? "logout_all" : "logout", "succeeded", auth.userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

function blankDisplayName(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("displayName" in body)) return body;
  const record = body as { displayName?: unknown };
  if (typeof record.displayName === "string" && record.displayName.trim() === "") return { ...record, displayName: null };
  return body;
}

function withAccount(req: Request, res: Response, next: NextFunction, run: () => Promise<void>): void {
  requireAccount(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    void run().catch(next);
  });
}

async function updateProfile(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  withAccount(req, res, next, async () => {
    const store = storeOrThrow(deps.readStore);
    const auth = req.auth;
    if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const parsed = updateDisplayNameSchema.safeParse(blankDisplayName(req.body));
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "displayName", message: "Use 1 to 80 characters, or leave the name empty." }]);
    const user = await updateDisplayName(store, auth.userId, parsed.data.displayName);
    audit(deps.logger, "profile", "succeeded", auth.userId);
    res.status(200).json(accountBody(toPublicAccount(user)));
  });
}

async function updatePreferenceRoute(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  withAccount(req, res, next, async () => {
    const store = storeOrThrow(deps.readStore);
    const auth = req.auth;
    if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    try {
      const user = await updatePreferences(store, auth.userId, req.body);
      audit(deps.logger, "preferences", "succeeded", auth.userId);
      res.status(200).json(accountBody(toPublicAccount(user)));
    } catch (error) {
      if (error instanceof AccountStateError) {
        audit(deps.logger, "preferences", "rejected", auth.userId);
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "preferences", message: "Those preferences are not valid." }]);
      }
      throw error;
    }
  });
}

async function updatePassword(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  withAccount(req, res, next, async () => {
    const store = storeOrThrow(deps.readStore);
    const auth = req.auth;
    if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "newPassword", message: "Check the current password and the new password." }]);
    }
    try {
      const user = await changePassword(store, deps.hasher, {
        userId: auth.userId,
        sessionId: auth.sessionId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      await revokePush(deps, { userId: auth.userId, deviceId: null, exceptDeviceId: auth.deviceId });
      audit(deps.logger, "password", "succeeded", auth.userId);
      res.status(200).json(accountBody(toPublicAccount(user)));
    } catch (error) {
      if (error instanceof AccountStateError) {
        audit(deps.logger, "password", "rejected", auth.userId);
        throw new HttpError(401, "unauthenticated", "The current password is incorrect.");
      }
      if (error instanceof PasswordPolicyError) {
        audit(deps.logger, "password", "rejected", auth.userId);
        throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "newPassword", message: error.messageText }]);
      }
      throw error;
    }
  });
}

async function revokeOneSession(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  withAccount(req, res, next, async () => {
    const store = storeOrThrow(deps.readStore);
    const auth = req.auth;
    if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const parsed = revokeSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "sessionId", message: "Choose a session." }]);
    const target = await store.findSessionById(parsed.data.sessionId);
    const result = await revokeOwnedSession(store, {
      userId: auth.userId,
      sessionId: parsed.data.sessionId,
      currentSessionId: auth.sessionId,
    });
    if (result === "revoked" && target?.userId === auth.userId) {
      await revokePush(deps, { userId: auth.userId, deviceId: target.deviceId });
    }
    if (result === "current") {
      throw new HttpError(400, "validation_error", "Request validation failed.", [{ field: "sessionId", message: "Sign out to end this session." }]);
    }
    if (result === "missing") throw new HttpError(404, "not_found", "That session was not found.");
    audit(deps.logger, "session_revoke", "succeeded", auth.userId);
    const user = await store.findUser(auth.userId);
    if (!user) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    const sessions = (await store.listSessionsForUser(user.id)).slice(0, 20);
    const devices = (await store.listDevicesForUser(user.id)).slice(0, 20);
    res.status(200).json(
      accountSessionResponseSchema.parse({
        account: toPublicAccount(user),
        sessions: sessions.map((item) => toPublicSession(item, auth.sessionId)),
        devices: devices.map((item) => toPublicDevice(item)),
      }),
    );
  });
}

async function deleteAccount(req: Request, res: Response, deps: AuthRouterDeps): Promise<void> {
  const store = storeOrThrow(deps.readStore);
  const auth = req.auth;
  if (auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  const parsed = deleteAccountBodySchema.safeParse(req.body);
  if (!parsed.success) {
    audit(deps.logger, "account_delete", "rejected", auth.userId);
    throw new HttpError(400, "validation_error", "Request validation failed.", [
      { field: "confirmation", message: 'Type DELETE and enter your password to close this account.' },
    ]);
  }
  try {
    if (deps.clearAccountData) await deps.clearAccountData(auth.userId);
    await closeOwnAccount(store, deps.hasher, { userId: auth.userId, password: parsed.data.password });
    await revokePush(deps, { userId: auth.userId, deviceId: null });
    clearCookies(res, deps.secureCookies);
    audit(deps.logger, "account_delete", "succeeded", auth.userId);
    res.status(204).end();
  } catch (error) {
    if (error instanceof AccountStateError) {
      audit(deps.logger, "account_delete", "rejected", auth.userId);
      throw new HttpError(401, "unauthenticated", "The current password is incorrect.");
    }
    throw error;
  }
}

async function refresh(req: Request, res: Response, next: NextFunction, deps: AuthRouterDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readStore);
    const mobile = presentedMobileClient(req);
    const cookieToken = readCookie(req.headers.cookie, authCookieNames.refresh);
    let refreshToken = cookieToken;
    let bearerTransport = false;
    if (!refreshToken && mobile) {
      const parsed = mobileRefreshRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
      refreshToken = parsed.data.refreshToken;
      bearerTransport = true;
    }
    if (!refreshToken) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
    await store.expireSessions(new Date());
    const issued = await rotateSession(store, refreshToken);
    applyCookies(res, issued, deps.secureCookies);
    audit(deps.logger, "refresh", "succeeded", issued.user.id);
    if (bearerTransport) {
      res.status(200).json(
        mobileSessionGrantSchema.parse({
          account: toPublicAccount(issued.user),
          accessToken: issued.accessToken,
          refreshToken: issued.refreshToken,
        }),
      );
      return;
    }
    res.status(200).json(accountBody(toPublicAccount(issued.user)));
  } catch (error) {
    if (error instanceof AccountStateError) {
      clearCookies(res, deps.secureCookies);
      audit(deps.logger, "refresh", error.reason === "reuse" ? "reuse" : "rejected", null);
      next(new HttpError(401, "unauthenticated", "Sign in to continue."));
      return;
    }
    next(error);
  }
}
