import type { NextFunction, Request, Response } from "express";
import type { Logger } from "../shared/logger.ts";

export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    const path = req.originalUrl.split("?")[0] || req.path;
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const headers: Record<string, string> = {};
      const authorization = req.get("authorization");
      const cookie = req.get("cookie");
      const contentType = req.get("content-type");
      if (authorization) headers.authorization = authorization;
      if (cookie) headers.cookie = cookie;
      if (contentType) headers["content-type"] = contentType;

      logger.info("request", {
        requestId: req.id,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        headers,
      });
    });
    next();
  };
}
