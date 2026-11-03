import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
};

export function SearchInput({
  id,
  label,
  value,
  onValueChange,
  hint,
  className,
  ...props
}: SearchInputProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
          ⌕
        </span>
        <input
          {...props}
          id={id}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-describedby={hintId}
          className={cn(
            "h-11 w-full rounded-control border border-border bg-surface pr-3 pl-9 text-base text-foreground placeholder:text-muted",
            className,
          )}
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
