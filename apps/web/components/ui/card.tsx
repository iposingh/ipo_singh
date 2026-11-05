import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Soft hover elevation for listing cards. Off for static panels. */
  interactive?: boolean;
};

export function Card({ className, children, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-panel border border-border bg-surface p-5 text-foreground shadow-card transition-[border-color,box-shadow,background] duration-[var(--ds-duration-fast)] ease-[var(--ds-easing-standard)]",
        interactive ? "ds-surface-interactive" : null,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
