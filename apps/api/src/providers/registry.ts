import type { ProviderSelection } from "../config/provider.ts";
import { createIpoGuruProvider, type IpoGuruProviderOptions } from "./ipo-guru/adapter.ts";
import { createMockProvider, type MockProviderOptions } from "./mock/adapter.ts";
import type { IpoDataProvider, ProviderKey } from "./provider.ts";

export type ProviderFactoryOptions = {
  mock?: MockProviderOptions;
  ipoGuru?: IpoGuruProviderOptions;
};

/** Builds one adapter. IPO Guru list calls run only when an enabled client is supplied. */
export function createProvider(key: ProviderKey, options: ProviderFactoryOptions = {}): IpoDataProvider {
  if (key === "ipo-guru") return createIpoGuruProvider(options.ipoGuru);
  return createMockProvider(options.mock);
}

export type RegisteredProviders = {
  primary: IpoDataProvider;
  fallback: IpoDataProvider | null;
};

/** Resolves the configured primary provider and an optional fallback adapter. */
export function createRegisteredProviders(
  selection: ProviderSelection,
  options: ProviderFactoryOptions = {},
): RegisteredProviders {
  return {
    primary: createProvider(selection.primary, options),
    fallback: selection.fallback ? createProvider(selection.fallback, options) : null,
  };
}
