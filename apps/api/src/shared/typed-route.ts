import type { NextFunction, Request, Response, Router } from "express";
import type { z } from "zod";

export type RouteContext = {
  req: Request;
  res: Response;
};

export type RouteResult<Body> = {
  status: number;
  body: Body;
};

class ResponseContractError extends Error {
  constructor() {
    super("Response did not match the API contract");
    this.name = "ResponseContractError";
  }
}

export function registerRoute<Body>(
  router: Router,
  route: {
    method: "get";
    path: string;
    response: z.ZodType<Body>;
    handler: (context: RouteContext) => Promise<RouteResult<Body>> | RouteResult<Body>;
  },
): void {
  router.get(route.path, (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(route.handler({ req, res }))
      .then((result) => {
        const parsed = route.response.safeParse(result.body);
        if (!parsed.success) {
          next(new ResponseContractError());
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(result.status).json(parsed.data);
      })
      .catch(next);
  });
}
