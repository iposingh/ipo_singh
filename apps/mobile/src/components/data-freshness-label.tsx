import { dataFreshnessCopy } from "../design/copy";
import { AppText } from "./app-text";

export function DataFreshnessLabel({ provenance }: { provenance: { retrievedAt: string | null; freshness: "missing" | "fresh" | "stale" } }) {
  const copy = dataFreshnessCopy(provenance);
  return (
    <AppText size="sm" tone={provenance.freshness === "stale" ? "warning" : "muted"}>
      {copy.freshness}. {copy.updated}
    </AppText>
  );
}
