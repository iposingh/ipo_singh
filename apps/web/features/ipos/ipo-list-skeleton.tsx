import { Skeleton } from "@/components/ui/skeleton";

export function IpoListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">{label}</span>
      <div className="grid gap-4 md:hidden">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
      <Skeleton className="hidden h-72 md:block" />
    </div>
  );
}
