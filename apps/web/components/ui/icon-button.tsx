import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-label": string;
  variant?: "primary" | "secondary" | "ghost";
};

const variantClass = {
  primary: "bg-primary-solid text-primary-foreground hover:bg-primary-solid-hover",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  ghost: "bg-transparent text-foreground hover:bg-surface",
} as const;

export function IconButton({
  variant = "ghost",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-control transition-colors duration-[var(--ds-duration-fast)] disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}
