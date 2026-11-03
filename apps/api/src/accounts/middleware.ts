import { authCookieNames, authCsrfHeader, type AccountRole } from "@ipo-singh/contracts";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../shared/errors.ts";
import type { AuthContext } from "./context.ts";
import { readCookie, readCsrfHeader } from "./cookies.ts";
import type { AccountStore } from "./records.ts";
import { resolveAccess } from "./session-service.ts";
import { hashToken, isTokenShape, tokensMatch } from "./tokens.ts";

const anonymous: AuthContext = { kind: "anonymous" };
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function presentedCredential(req: Request): { token: string; transport: "cookie" | "bearer" } | null {
  const cookie = readCookie(headerValue(req, "cookie"), authCookieNames.access);
  if (cookie) return { token: cookie, transport: "cookie" };
  const authorization = headerValue(req, "authorization")?.trim() ?? "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{1,128})$/.exec(authorization);
  const token = match?.[1];
  if (!token) return null;
  return { token, transport: "bearer" };
}

/**
 * Optional authentication. Public IPO routes stay reachable.
 * A missing credential stays anonymous. A bad credential does not block those routes.
 * A database failure while a credential is present is recorded as unavailable.
 */
export function createAuthMiddleware(readStore: () => AccountStore | undefined) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const presented = presentedCredential(req);
    if (!presented) {
      req.auth = anonymous;
      req.authFailure = null;
      next();
      return;
    }

    const store = readStore();
    if (!store) {
      req.auth = anonymous;
      req.authFailure = "unavailable";
      next();
      return;
    }

    try {
      const resolved = await resolveAccess(store, presented.token);
      if (resolved.status === "user") {
        req.auth = {
          kind: "user",
          userId: resolved.user.id,
          sessionId: resolved.session.id,
          deviceId: resolved.session.deviceId,
          role: resolved.user.role,
          client: resolved.session.client,
          transport: presented.transport,
          csrfTokenHash: resolved.session.csrfTokenHash,
        };
        req.authFailure = null;
      } else {
        req.auth = anonymous;
        req.authFailure = "invalid";
      }
      next();
    } catch {
      req.auth = anonymous;
      req.authFailure = "unavailable";
      next();
    }
  };
}

/** Cookie-authenticated mutations must echo the CSRF cookie. Bearer clients skip this check. */
export function createCookieCsrf() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!unsafeMethods.has(req.method) || req.auth?.kind !== "user" || req.auth.transport !== "cookie") {
      next();
      return;
    }
    const presented = readCsrfHeader(headerValue(req, authCsrfHeader));
    const matches = presented !== null && isTokenShape(presented) && tokensMatch(hashToken(presented), req.auth.csrfTokenHash);
    if (!matches) {
      next(new HttpError(403, "forbidden", "This request could not be verified."));
      return;
    }
    next();
  };
}

/** Later account routes use this. Catalogue routes do not. */
export function requireAccount(req: Request, _res: Response, next: NextFunction): void {
  if (req.authFailure === "unavailable") {
    next(new HttpError(503, "unavailable", "Sign-in is temporarily unavailable."));
    return;
  }
  if (req.auth?.kind !== "user") {
    next(new HttpError(401, "unauthenticated", "Sign in to continue."));
    return;
  }
  next();
}

/** Role gate on top of the same session. Public IPO routes do not use this. */
export function requireRole(allowed: readonly AccountRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    requireAccount(req, _res, (error) => {
      if (error) {
        next(error);
        return;
      }
      if (req.auth?.kind !== "user" || !allowed.includes(req.auth.role)) {
        next(new HttpError(403, "forbidden", "You do not have access to this page."));
        return;
      }
      next();
    });
  };
}
