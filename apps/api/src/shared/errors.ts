import type { ApiError } from "@ipo-singh/contracts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiError["code"];
  readonly fieldErrors: NonNullable<ApiError["fieldErrors"]> | undefined;

  constructor(
    status: number,
    code: ApiError["code"],
    message: string,
    fieldErrors?: NonNullable<ApiError["fieldErrors"]>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class ConfigError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid environment: ${fields.join(", ")}`);
    this.name = "ConfigError";
    this.fields = fields;
  }
}
