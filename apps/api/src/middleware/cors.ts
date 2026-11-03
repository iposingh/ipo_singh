import cors from "cors";

/** Browser preflight may send these. The native client header is intentionally absent. */
export const corsAllowedHeaders = ["Accept", "Content-Type", "X-Request-Id", "X-Ops-Token", "X-CSRF-Token", "Authorization"] as const;

export function createCors(origins: readonly string[]) {
  const allowed = new Set(origins);
  return cors({
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [...corsAllowedHeaders],
    exposedHeaders: ["X-Request-Id", "Retry-After"],
    maxAge: 600,
  });
}
