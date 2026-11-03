import { LoadingState } from "@/components/ui/loading-state";

export default function AdminBannersLoading() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <LoadingState label="Loading banners" />
    </div>
  );
}
