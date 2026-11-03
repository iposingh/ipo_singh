import { apiErrorSchema, type ApiError } from "@ipo-singh/contracts";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { CacheStormError } from "../cache/errors.ts";
import { PersistenceError } from "../db/persistence-error.ts";
import { ProviderOutageError, QuotaExhaustedError } from "../providers/quota.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { recordValidationFailure } from "../ops/validation.ts";
import { redactString } from "../shared/redact.ts";

const fallback: ApiError = {
  code: "unavailable",
  message: "The API could not complete this request.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fieldErrorsFromZod(error: ZodError, production: boolean): NonNullable<ApiError["fieldErrors"]> {
  return error.issues.slice(0, 20).map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".").slice(0, 80) : "request",
    message: production ? "Invalid value." : issue.message.slice(0, 300),
  }));
}

export function toErrorResponse(error: unknown, options?: { production?: boolean }): { status: number; body: ApiError } {
  const production = options?.production === true;
  if (error instanceof HttpError) {
    const body: ApiError = {
      code: error.code,
      message: error.message.slice(0, 300),
    };
    if (error.fieldErrors && error.fieldErrors.length > 0) {
      body.fieldErrors = error.fieldErrors;
    }
    return validated(error.status, body);
  }

  if (error instanceof PersistenceError || error instanceof ProviderOutageError) {
    return validated(503, {
      code: "unavailable",
      message: "IPO data is temporarily unavailable.",
    });
  }

  if (error instanceof QuotaExhaustedError || error instanceof CacheStormError) {
    return validated(429, {
      code: "rate_limited",
      message: "IPO data is temporarily unavailable.",
    });
  }

  if (error instanceof ZodError) {
    return validated(400, {
      code: "validation_error",
      message: "Request validation failed.",
      fieldErrors: fieldErrorsFromZod(error, production),
    });
  }

  if (isRecord(error) && error.type === "entity.too.large") {
    return validated(413, {
      code: "validation_error",
      message: "Request body exceeds the size limit.",
    });
  }

  if (isRecord(error) && error.type === "entity.parse.failed") {
    return validated(400, {
      code: "validation_error",
      message: "Request body must be valid JSON.",
    });
  }

  return { status: 500, body: fallback };
}

function validated(status: number, body: ApiError): { status: number; body: ApiError } {
  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) return { status: 500, body: fallback };
  return { status, body: parsed.data };
}

export function errorHandler(logger: Logger, options?: { production?: boolean }) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const mapped = toErrorResponse(error, options);
    if (mapped.body.code === "validation_error") recordValidationFailure();
    if (mapped.status >= 500) {
      logger.error("request failed", {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl.split("?")[0] || req.path,
        name: error instanceof Error ? error.name : "unknown",
        detail: redactString(error instanceof Error ? error.message : "unknown"),
      });
    }
    if (res.headersSent) return;
    res.status(mapped.status).json(mapped.body);
  };
}
