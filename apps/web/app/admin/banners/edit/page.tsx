"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";

const bannerIdPattern = /^banner-[a-f0-9]{16}$/;

/**
 * Legacy query-string editor. Prefer `/admin/banners/[bannerId]`.
 * Implemented as a client redirect that always paints a loading segment so
 * Cache Components instant-navigation validation is not dropped by `redirect()`.
 */
function EditBannerRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("banner") ?? "";

  useEffect(() => {
    if (bannerIdPattern.test(raw)) {
      router.replace(`/admin/banners/${raw}`);
      return;
    }
    router.replace("/admin/banners");
  }, [raw, router]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <LoadingState label="Opening banner editor" />
    </div>
  );
}

export default function EditBannerRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-6">
          <LoadingState label="Opening banner editor" />
        </div>
      }
    >
      <EditBannerRedirect />
    </Suspense>
  );
}
