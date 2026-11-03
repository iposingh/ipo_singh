import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Load apps/api/.env for local development. Existing process variables stay in place. */
export function loadLocalEnv(cwd = process.cwd()): void {
  if (process.env.NODE_ENV === "production") return;
  const path = resolve(cwd, ".env");
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}
