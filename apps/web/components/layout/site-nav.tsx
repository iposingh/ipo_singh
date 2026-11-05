"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { shouldPrefetchPath } from "@/lib/navigation/prefetch";
import { isCurrentPath, type SiteRoute } from "@/lib/navigation/routes";

type SiteNavProps = {
  items: readonly SiteRoute[];
  label: string;
  className?: string;
  listClassName?: string;
  linkClassName?: string;
  compact?: boolean;
  onNavigate?: () => void;
};

type SiteNavListProps = SiteNavProps & {
  pathname: string | null;
};

function SiteNavList({
  items,
  label,
  className,
  listClassName,
  linkClassName,
  compact = false,
  onNavigate,
  pathname,
}: SiteNavListProps) {
  return (
    <nav aria-label={label} className={className}>
      <ul className={cn("flex flex-wrap items-center gap-1", listClassName)}>
        {items.map((item) => {
          const current = pathname !== null && isCurrentPath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={shouldPrefetchPath(item.href)}
                aria-current={current ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "inline-flex items-center rounded-control px-3 text-sm font-medium",
                  compact ? "h-11" : "h-10",
                  current
                    ? "bg-accent-subtle text-foreground shadow-card ring-1 ring-[color:var(--ds-border-subtle)]"
                    : "text-muted hover:bg-surface-muted hover:text-foreground",
                  linkClassName,
                )}
              >
                {compact ? item.shortLabel : item.label}
                {item.badge ? (
                  <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide text-muted uppercase">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SiteNavCurrent(props: SiteNavProps) {
  const pathname = usePathname();
  return <SiteNavList {...props} pathname={pathname} />;
}

/**
 * Current-link state reads the pathname. With Cache Components that value is
 * request URL data, so it stays inside Suspense and the links themselves render
 * in the fallback. The route is not switched to blocking rendering.
 */
export function SiteNav(props: SiteNavProps) {
  return (
    <Suspense fallback={<SiteNavList {...props} pathname={null} />}>
      <SiteNavCurrent {...props} />
    </Suspense>
  );
}
