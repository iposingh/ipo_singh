import { LoadingState } from "@/components/ui/loading-state";

/** Segment-level Suspense fallback for instant admin navigations. */
export default function AdminLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <LoadingState label="Loading administration" />
    </div>
  );
}
