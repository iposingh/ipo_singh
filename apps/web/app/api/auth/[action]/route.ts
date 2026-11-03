import { proxyAuth } from "@/lib/auth/proxy";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ action: string }>;
};

async function handle(request: Request, context: RouteContext): Promise<NextResponse> {
  const { action } = await context.params;
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
  if (body && body.length > 4_000) {
    return NextResponse.json({ code: "validation_error", message: "Request validation failed." }, { status: 400 });
  }
  const result = await proxyAuth({
    action,
    method: request.method,
    origin: process.env.IPO_SINGH_API_ORIGIN,
    cookie: request.headers.get("cookie"),
    csrf: request.headers.get("x-csrf-token"),
    body,
  });
  const response =
    result.status === 204
      ? new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } })
      : new NextResponse(result.body, {
          status: result.status,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
  for (const cookie of result.cookies) response.headers.append("set-cookie", cookie);
  return response;
}

export function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  return handle(request, context);
}

export function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return handle(request, context);
}

export function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  return handle(request, context);
}
