import type { AccountClient, AccountRole } from "@ipo-singh/contracts";

export type AuthContext =
  | { kind: "anonymous" }
  | {
      kind: "user";
      userId: string;
      sessionId: string;
      deviceId: string;
      role: AccountRole;
      client: AccountClient;
      transport: "cookie" | "bearer";
      csrfTokenHash: string;
    };

/** Why a presented credential did not become a user. Null when the request is anonymous or signed in. */
export type AuthFailure = null | "invalid" | "unavailable";
