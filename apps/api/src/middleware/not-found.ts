import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../shared/errors.ts";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new HttpError(404, "not_found", "No matching API route was found."));
}
