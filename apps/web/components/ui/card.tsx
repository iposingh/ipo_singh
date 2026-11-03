import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-panel border border-border bg-surface p-5 text-foreground shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
