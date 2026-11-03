import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const incomingId = /^[A-Za-z0-9_-]{1,80}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const header = req.get("x-request-id");
  const id = header && incomingId.test(header) ? header : randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
