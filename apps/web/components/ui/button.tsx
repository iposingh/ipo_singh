import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-solid text-primary-foreground hover:bg-primary-solid-hover active:bg-primary-solid-active",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  ghost: "bg-transparent text-foreground hover:bg-surface",
  danger: "bg-negative-solid text-negative-foreground hover:bg-negative-solid-hover",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-10 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors duration-[var(--ds-duration-fast)] ease-[var(--ds-easing-standard)] disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          />
          <span className="sr-only">Loading. </span>
        </>
      ) : null}
      {children}
    </button>
  );
}
