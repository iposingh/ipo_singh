import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "neutral" | "positive" | "negative" | "warning";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-background text-foreground",
  positive: "bg-background text-positive-text",
  negative: "bg-background text-negative-text",
  warning: "bg-background text-warning-text",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      <BadgeMark tone={tone} />
      {children}
    </span>
  );
}

function BadgeMark({ tone }: { tone: BadgeTone }) {
  if (tone === "neutral") {
    return null;
  }
  const symbol = tone === "positive" ? "▲" : tone === "negative" ? "▼" : "!";
  return (
    <span aria-hidden className="text-[0.7rem] leading-none">
      {symbol}
    </span>
  );
}
