"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { AccessDenied } from "@/features/admin/access-denied";
import { loadAdminGate, roleLabel, signOutAdmin, type AdminGate } from "@/features/admin/admin-session";
import { SessionExpired } from "@/features/admin/session-expired";
import { cn } from "@/lib/cn";

const AdminSessionContext = createContext<AdminGate | null>(null);
const sessionRefreshMs = 5 * 60_000;

const navLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/articles", label: "News Management" },
  { href: "/admin/records", label: "Records" },
  { href: "/admin/allotment", label: "Allotment" },
  { href: "/admin/sync", label: "Sync" },
  { href: "/admin/cache", label: "Cache" },
  { href: "/admin/accounts", label: "Accounts" },
] as const;

const superAdminLinks = [
  { href: "/admin/provider", label: "Provider" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function useAdminSession(): AdminGate | null {
  return useContext(AdminSessionContext);
}

function isPublicAdminPath(pathname: string | null): boolean {
  return pathname === "/admin/login" || pathname === "/admin/denied";
}

function GateMessage({ gate }: { gate: AdminGate | null }) {
  if (!gate) return <LoadingState label="Checking the session" />;
  if (gate.state === "expired") return <SessionExpired />;
  if (gate.state === "denied") return <AccessDenied />;
  if (gate.state === "rate_limited") {
    return (
      <ErrorState
        title="Too many administration requests"
        message="Wait a few seconds, then refresh. Session checks no longer run on every sidebar click."
      />
    );
  }
  if (gate.state === "unavailable") {
    return (
      <ErrorState
        title="Administration is unavailable"
        message="The session could not be checked. Wait a moment and refresh."
      />
    );
  }
  return <LoadingState label="Checking the session" />;
}

/**
 * Owns session state for the admin tree. Always renders `{children}` so Cache
 * Components can validate page segments for instant navigation.
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<AdminGate | null>(null);
  const lastLoadedAt = useRef(0);

  const refreshGate = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && lastLoadedAt.current > 0 && now - lastLoadedAt.current < sessionRefreshMs && gate?.state === "ready") {
        return;
      }
      const next = await loadAdminGate();
      lastLoadedAt.current = Date.now();
      setGate(next);
    },
    [gate?.state],
  );

  useEffect(() => {
    let active = true;
    void loadAdminGate().then((next) => {
      if (!active) return;
      lastLoadedAt.current = Date.now();
      setGate(next);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onFocus() {
      void refreshGate(false);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshGate]);

  return <AdminSessionContext.Provider value={gate}>{children}</AdminSessionContext.Provider>;
}

function AdminHeaderBody({ pathname }: { pathname: string | null }) {
  const gate = useAdminSession();
  const open = isPublicAdminPath(pathname);
  const ready = gate?.state === "ready";
  const showRole = Boolean(ready && !open);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3">
      <BrandLogo width={148} priority />
      <p className="text-sm text-muted">
        {showRole && gate?.state === "ready" ? roleLabel(gate.role) : "Administration"}
      </p>
    </header>
  );
}

function AdminNavBody({ pathname }: { pathname: string | null }) {
  const router = useRouter();
  const gate = useAdminSession();
  const [pending, setPending] = useState(false);
  const open = isPublicAdminPath(pathname);
  const ready = gate?.state === "ready";

  if (!ready || open || gate?.state !== "ready") return null;

  const links = gate.role === "super-admin" ? [...navLinks, ...superAdminLinks] : [...navLinks];

  async function signOut() {
    setPending(true);
    await signOutAdmin();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <>
      <nav aria-label="Administration" className="border-b border-border bg-surface lg:w-60 lg:border-r lg:border-b-0">
        <ul className="flex gap-2 overflow-x-auto p-3 lg:flex-col">
          {links.map((link) => {
            const current =
              pathname != null &&
              (pathname === link.href || (link.href !== "/admin" && pathname.startsWith(`${link.href}/`)));
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  prefetch={false}
                  className={cn(
                    "block rounded-control px-3 py-2 text-sm font-medium whitespace-nowrap",
                    current ? "bg-primary-solid text-primary-foreground" : "text-foreground hover:bg-background",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden px-3 pb-4 lg:block">
          <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </nav>
      <div className="border-b border-border px-4 py-3 lg:hidden">
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </>
  );
}

function AdminGateOverlayBody({ pathname }: { pathname: string | null }) {
  const gate = useAdminSession();
  const open = isPublicAdminPath(pathname);
  if (open || gate?.state === "ready") return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background px-4 py-8">
      <GateMessage gate={gate} />
    </div>
  );
}

function withPathname(Body: (props: { pathname: string | null }) => ReactNode) {
  function Fallback() {
    return <Body pathname={null} />;
  }
  function WithPath() {
    const pathname = usePathname();
    return <Body pathname={pathname} />;
  }
  function Bound() {
    return (
      <Suspense fallback={<Fallback />}>
        <WithPath />
      </Suspense>
    );
  }
  return Bound;
}

export const AdminHeaderBar = withPathname(AdminHeaderBody);
export const AdminSideNav = withPathname(AdminNavBody);
export const AdminGateOverlay = withPathname(AdminGateOverlayBody);

/**
 * Convenience wrapper used by tests or non-layout callers. Prefer composing
 * AdminSessionProvider + chrome siblings in the Server layout so `{children}`
 * stays in the layout segment for instant-navigation validation.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <div className="relative flex min-h-full flex-1 flex-col bg-background">
        <AdminHeaderBar />
        <div className="flex min-h-full flex-1 flex-col lg:flex-row">
          <AdminSideNav />
          <div id="main-content" className="relative flex min-w-0 flex-1 flex-col gap-4 px-4 py-6">
            {children}
          </div>
        </div>
        <AdminGateOverlay />
      </div>
    </AdminSessionProvider>
  );
}
