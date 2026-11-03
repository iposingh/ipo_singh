/**
 * The upstream market-data client is intentionally not connected.
 * Public web and mobile clients must never call a provider directly.
 * Importing this module opens no connection and defines no vendor endpoints.
 */
export const providerStatus = "not_configured" as const;

export { providerCapabilitiesSchema, providerCapabilitySchema, providerFeatures } from "./capabilities.ts";
export type { ProviderCapabilities, ProviderCapability, ProviderFeature } from "./capabilities.ts";
export { createProviderGateway } from "./gateway.ts";
export type { ProviderGateway, ProviderRead } from "./gateway.ts";
export { createIpoGuruProvider } from "./ipo-guru/adapter.ts";
export { createMockProvider } from "./mock/adapter.ts";
export type { MockBehavior, MockProviderOptions } from "./mock/adapter.ts";
export type { IpoDataProvider, ProviderKey, ProviderSource } from "./provider.ts";
export { providerKeys } from "./provider.ts";
export { createProvider, createRegisteredProviders } from "./registry.ts";
export type { RegisteredProviders } from "./registry.ts";
