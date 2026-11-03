import { proxyWatchlist } from "@/lib/watchlist/proxy";
import { NextResponse } from "next/server";

async function handle(request: Request): Promise<NextResponse> {
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
  if (body && body.length > 4_000) {
    return NextResponse.json({ code: "validation_error", message: "Request validation failed." }, { status: 400 });
  }
  const result = await proxyWatchlist({
    method: request.method,
    origin: process.env.IPO_SINGH_API_ORIGIN,
    cookie: request.headers.get("cookie"),
    csrf: request.headers.get("x-csrf-token"),
    body,
  });
  return new NextResponse(result.body, {
    status: result.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
