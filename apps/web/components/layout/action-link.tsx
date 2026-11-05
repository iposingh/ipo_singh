import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { shouldPrefetchPath } from "@/lib/navigation/prefetch";

const variantClass = {
  primary: "bg-primary-solid text-primary-foreground hover:bg-primary-solid-hover",
  secondary:
    "border border-border bg-surface text-foreground shadow-card hover:border-[color:var(--ds-border-accent-hover)] hover:bg-[image:var(--ds-surface-fill-hover)]",
} as const;

type ActionLinkProps = {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variantClass;
  className?: string;
  /** Defaults from the site prefetch policy. Actual navigation still loads full page data. */
  prefetch?: boolean;
};

export function ActionLink({ href, children, variant = "primary", className, prefetch }: ActionLinkProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch ?? shouldPrefetchPath(href)}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-control px-4 text-sm font-medium transition-[filter,box-shadow,background-color,border-color] duration-[var(--ds-duration-fast)] ease-[var(--ds-easing-standard)]",
        variantClass[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
