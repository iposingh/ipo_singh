import { proxyWatchlist } from "@/lib/watchlist/proxy";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ ipoId: string }>;
};

async function handle(request: Request, context: RouteContext): Promise<NextResponse> {
  const { ipoId } = await context.params;
  const result = await proxyWatchlist({
    method: request.method,
    ipoId,
    origin: process.env.IPO_SINGH_API_ORIGIN,
    cookie: request.headers.get("cookie"),
    csrf: request.headers.get("x-csrf-token"),
    body: null,
  });
  if (result.status === 204) return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  return new NextResponse(result.body, {
    status: result.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  return handle(request, context);
}

export function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  return handle(request, context);
}
