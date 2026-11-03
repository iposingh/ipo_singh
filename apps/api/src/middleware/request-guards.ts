import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../shared/errors.ts";

const maxUrlLength = 2_048;
const privateKey = /^(?:pan|pannumber|applicationnumber|applicationno|applicant|demat|clientid|dpid)$/;
const panValue = /^[A-Z]{5}\d{4}[A-Z]$/;

function normalizedKey(key: string): string {
  return key.replace(/[_-]/g, "").toLowerCase();
}

function findPrivate(value: unknown, depth = 0): string | null {
  if (depth > 4 || value === null || value === undefined) return null;
  if (typeof value === "string") return panValue.test(value.trim().toUpperCase()) ? "request" : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPrivate(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (privateKey.test(normalizedKey(key))) return key.slice(0, 80) || "request";
      const found = findPrivate(item, depth + 1);
      if (found) return found === "request" ? key.slice(0, 80) || "request" : found;
    }
  }
  return null;
}

function reject(field: string): HttpError {
  return new HttpError(400, "validation_error", "Request validation failed.", [
    { field, message: "This field is not accepted." },
  ]);
}

export function rejectUnsafeRequestTarget(req: Request, _res: Response, next: NextFunction): void {
  if (req.originalUrl.length > maxUrlLength) {
    next(new HttpError(400, "validation_error", "Request validation failed.", [{ field: "query", message: "Query string is too long." }]));
    return;
  }
  const field = findPrivate(req.query);
  if (field) {
    next(reject(field));
    return;
  }
  next();
}

export function rejectPrivateRequestBody(req: Request, _res: Response, next: NextFunction): void {
  const field = findPrivate(req.body);
  if (field) {
    next(reject(field));
    return;
  }
  next();
}
