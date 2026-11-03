/**
 * Modular allotment-result verification entrypoints.
 *
 * A scheduled allotment date, a registrar portal URL, or an IPO name in a dropdown
 * is not evidence by itself unless a registrar-specific adapter documents that signal.
 *
 * CAPTCHA-protected registrar pages and prohibited scraping are out of scope.
 */

export {
  allotmentVerificationLimitation,
  unsupportedAllotmentVerification,
  adminConfirmAllotment,
} from "./allotment/shapes.ts";
export type { AllotmentVerificationShape as AllotmentVerificationRecord } from "./allotment/shapes.ts";

export {
  runAllotmentVerificationPass,
  adminConfirmStoredAllotment,
  identifyRegistrar,
  applyAllotmentConfirmation,
} from "./allotment/service.ts";
export { createAllotmentVerifiers, resolveVerifierId } from "./allotment/adapters/index.ts";
export { planAllotmentCheck, defaultAllotmentVerifyPolicy } from "./allotment/schedule.ts";
export { createMemoryAllotmentVerificationStore } from "./allotment/memory-store.ts";
export { createMongoAllotmentVerificationStore } from "./allotment/mongo-store.ts";
