import type { AuthContext, AuthFailure } from "../accounts/context.ts";

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: AuthContext;
      authFailure?: AuthFailure;
    }
  }
}

export {};
