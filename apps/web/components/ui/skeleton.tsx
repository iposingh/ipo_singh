import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "block animate-pulse rounded-control bg-border motion-reduce:animate-none",
        className,
      )}
    />
  );
}
