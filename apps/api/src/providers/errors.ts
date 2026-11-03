import type { ProviderFeature } from "./capabilities.ts";

export type ProviderErrorCode = "unsupported" | "not_connected" | "timeout" | "unavailable" | "malformed";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerKey: string;
  readonly feature: ProviderFeature;
  /** Transport failures may try another provider. Validation and unsupported features may not. */
  readonly fallbackEligible: boolean;
  readonly fields: readonly string[];

  constructor(
    code: ProviderErrorCode,
    providerKey: string,
    feature: ProviderFeature,
    message: string,
    fallbackEligible: boolean,
    fields: readonly string[] = [],
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.providerKey = providerKey;
    this.feature = feature;
    this.fallbackEligible = fallbackEligible;
    this.fields = fields;
  }
}

export class ProviderUnsupportedError extends ProviderError {
  constructor(providerKey: string, feature: ProviderFeature) {
    super("unsupported", providerKey, feature, "This provider does not support this feature.", false);
    this.name = "ProviderUnsupportedError";
  }
}

export class ProviderNotConnectedError extends ProviderError {
  constructor(providerKey: string, feature: ProviderFeature, fallbackEligible = false) {
    super("not_connected", providerKey, feature, "The market-data provider client is not connected.", fallbackEligible);
    this.name = "ProviderNotConnectedError";
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(providerKey: string, feature: ProviderFeature) {
    super("timeout", providerKey, feature, "The market-data provider timed out.", true);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(providerKey: string, feature: ProviderFeature) {
    super("unavailable", providerKey, feature, "The market-data provider is unavailable.", true);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderPayloadError extends ProviderError {
  constructor(providerKey: string, feature: ProviderFeature, fields: readonly string[]) {
    super("malformed", providerKey, feature, "The provider payload did not match the domain contract.", false, fields);
    this.name = "ProviderPayloadError";
  }
}
