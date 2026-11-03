import { gmpModule } from "./gmp/index.ts";
import { ipoModule } from "./ipos/index.ts";
import { subscriptionModule } from "./subscriptions/index.ts";

export const deferredModules = [ipoModule, gmpModule, subscriptionModule] as const;

export function assertDeferredModules(): void {
  for (const module of deferredModules) {
    if (module.publicRoutes) {
      throw new Error("Public IPO routes are not part of the API foundation.");
    }
  }
}
