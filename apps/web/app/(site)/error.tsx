"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

type SiteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function SiteError({ error, reset }: SiteErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const reference = error.digest ? ` Reference ${error.digest}.` : "";

  return (
    <PageContainer>
      <ErrorState
        title="This page could not be shown"
        message={`The page failed to load. No IPO figures were fetched or changed.${reference}`}
        action={<Button onClick={() => reset()}>Try again</Button>}
      />
    </PageContainer>
  );
}
