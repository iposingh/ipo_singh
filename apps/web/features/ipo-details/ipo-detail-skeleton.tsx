import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export function IpoDetailSkeleton() {
  return (
    <PageContainer className="grid gap-8">
      <div aria-busy="true" className="grid gap-8">
        <p className="sr-only" role="status">
          Loading IPO
        </p>
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-2/3 max-w-md" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {["Overview", "GMP", "Subscription", "Financials"].map((label) => (
            <Skeleton key={label} className="h-10 w-24 shrink-0" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="hidden h-40 w-full md:block" />
      </div>
    </PageContainer>
  );
}
