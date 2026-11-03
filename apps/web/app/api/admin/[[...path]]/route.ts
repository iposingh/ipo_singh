import { proxyAdmin } from "@/lib/admin/proxy";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function handle(request: Request, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
  if (body && body.length > 4_000) {
    return NextResponse.json({ code: "validation_error", message: "Request validation failed." }, { status: 400 });
  }
  const result = await proxyAdmin({
    method: request.method,
    suffix: path?.join("/") ?? "",
    search: new URL(request.url).search,
    origin: process.env.IPO_SINGH_API_ORIGIN,
    cookie: request.headers.get("cookie"),
    csrf: request.headers.get("x-csrf-token"),
    body,
  });
  if (result.status === 204) {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  if (result.retryAfterSeconds != null) headers.set("retry-after", String(result.retryAfterSeconds));
  return new NextResponse(result.body, {
    status: result.status,
    headers,
  });
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

export function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  return handle(request, context);
}
