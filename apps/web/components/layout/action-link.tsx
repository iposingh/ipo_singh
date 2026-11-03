import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variantClass = {
  primary: "bg-primary-solid text-primary-foreground hover:bg-primary-solid-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
} as const;

type ActionLinkProps = {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variantClass;
  className?: string;
};

export function ActionLink({ href, children, variant = "primary", className }: ActionLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-control px-4 text-sm font-medium",
        variantClass[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
