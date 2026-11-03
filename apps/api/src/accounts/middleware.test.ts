import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../shared/errors.ts";
import { createMemoryAccountStore } from "./memory-store.ts";
import { createAuthMiddleware, createCookieCsrf, requireAccount } from "./middleware.ts";
import { activateUser, createPendingUser, issueSession, registerDevice } from "./session-service.ts";

function request(method: string, headers: Record<string, string> = {}): Request {
  return { method, headers } as Request;
}

function run(middleware: (req: Request, res: Response, next: NextFunction) => unknown, req: Request): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const result = middleware(req, {} as Response, (error?: unknown) => {
      if (error) reject(error);
      else resolve(null);
    });
    if (result instanceof Promise) result.catch(reject);
  });
}

async function signedIn() {
  const store = createMemoryAccountStore();
  const user = await activateUser(store, (await createPendingUser(store, { email: "reader@example.com" })).id);
  const device = await registerDevice(store, { userId: user.id, client: "web" });
  const issued = await issueSession(store, { userId: user.id, deviceId: device.id });
  return { store, issued };
}

test("cookie mutations require the CSRF header and bearer requests do not", async () => {
  const { store, issued } = await signedIn();
  const auth = createAuthMiddleware(() => store);
  const csrf = createCookieCsrf();

  const blocked = request("POST", { cookie: `ipo_singh_access=${issued.accessToken}` });
  await run(auth, blocked);
  await assert.rejects(run(csrf, blocked), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "forbidden");
    return true;
  });

  const allowed = request("POST", {
    cookie: `ipo_singh_access=${issued.accessToken}`,
    "x-csrf-token": issued.csrfToken,
  });
  await run(auth, allowed);
  await run(csrf, allowed);
  assert.equal(allowed.auth?.kind, "user");
  if (allowed.auth?.kind === "user") assert.equal(allowed.auth.transport, "cookie");

  const both = request("POST", {
    cookie: `ipo_singh_access=${issued.accessToken}`,
    authorization: `Bearer ${issued.accessToken}`,
  });
  await run(auth, both);
  if (both.auth?.kind === "user") assert.equal(both.auth.transport, "cookie");
  await assert.rejects(run(csrf, both), (error: unknown) => error instanceof HttpError && error.status === 403);

  const bearer = request("DELETE", { authorization: `Bearer ${issued.accessToken}` });
  await run(auth, bearer);
  await run(csrf, bearer);
  if (bearer.auth?.kind === "user") assert.equal(bearer.auth.transport, "bearer");

  const anonymous = request("POST");
  await run(auth, anonymous);
  await run(csrf, anonymous);
  assert.equal(anonymous.auth?.kind, "anonymous");
  assert.equal(anonymous.authFailure, null);
});

test("a missing account store and a bad credential stay off public routes", async () => {
  const { issued } = await signedIn();
  const missing = request("GET", { cookie: `ipo_singh_access=${issued.accessToken}` });
  await run(createAuthMiddleware(() => undefined), missing);
  assert.equal(missing.authFailure, "unavailable");
  await assert.rejects(run(requireAccount, missing), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 503);
    assert.equal(error.code, "unavailable");
    return true;
  });

  const { store } = await signedIn();
  const invalid = request("GET", { cookie: "ipo_singh_access=not-a-session" });
  await run(createAuthMiddleware(() => store), invalid);
  assert.equal(invalid.auth?.kind, "anonymous");
  assert.equal(invalid.authFailure, "invalid");
  await assert.rejects(run(requireAccount, invalid), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 401);
    assert.equal(error.code, "unauthenticated");
    return true;
  });
});
