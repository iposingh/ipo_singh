import { readCatalogueTarget } from "../screens/catalogue-target";
import { deviceJsonCache } from "./device-store";
import { createHistoryClient } from "./history";
import { createCatalogueClient } from "./listings";

let singleton: ReturnType<typeof createCatalogueClient> | null = null;
let historySingleton: ReturnType<typeof createHistoryClient> | null = null;

export function catalogueClient() {
  singleton ??= createCatalogueClient(deviceJsonCache());
  return singleton;
}

export function historyClient() {
  historySingleton ??= createHistoryClient(deviceJsonCache());
  return historySingleton;
}

/** Warm the issue cache before navigation so list → detail does not wait on a cold fetch. */
export function warmCatalogueIssue(slug: string): void {
  void readCatalogueTarget().then((target) => {
    if ("error" in target) return;
    void catalogueClient().loadIssue(slug, { origin: target.origin, offline: target.offline });
  });
}
