import { readCsrfToken } from "@/features/auth/csrf";

export type AdminGate =
  | { state: "ready"; role: "admin" | "super-admin"; email: string | null; displayName: string | null }
  | { state: "denied" }
  | { state: "expired" }
  | { state: "rate_limited" }
  | { state: "unavailable" };

const maxAttempts = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header && /^\d+$/.test(header)) return Math.min(8_000, Number(header) * 1_000);
  return Math.min(4_000, 400 * 2 ** attempt);
}

export async function loadAdminGate(): Promise<AdminGate> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch("/api/admin/session", {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status === 401) return { state: "expired" };
      if (response.status === 403) return { state: "denied" };
      if (response.status === 429) {
        if (attempt + 1 < maxAttempts) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        return { state: "rate_limited" };
      }
      if (!response.ok) return { state: "unavailable" };
      const payload: unknown = await response.json();
      const account = payload && typeof payload === "object" && "account" in payload ? payload.account : null;
      const role = account && typeof account === "object" && "role" in account ? account.role : null;
      if (role !== "admin" && role !== "super-admin") return { state: "denied" };
      const email =
        account && typeof account === "object" && "email" in account && (typeof account.email === "string" || account.email === null)
          ? account.email
          : null;
      const displayName =
        account &&
        typeof account === "object" &&
        "displayName" in account &&
        (typeof account.displayName === "string" || account.displayName === null)
          ? account.displayName
          : null;
      return { state: "ready", role, email, displayName };
    } catch {
      if (attempt + 1 < maxAttempts) {
        await sleep(retryDelayMs(new Response(null, { status: 503 }), attempt));
        continue;
      }
      return { state: "unavailable" };
    }
  }
  return { state: "unavailable" };
}

export async function signOutAdmin(): Promise<boolean> {
  const csrf = readCsrfToken(document.cookie);
  const headers = new Headers({ accept: "application/json" });
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch("/api/auth/logout", { method: "POST", headers });
  return response.ok;
}

export function roleLabel(role: "admin" | "super-admin"): string {
  return role === "super-admin" ? "Super Admin" : "Admin";
}
