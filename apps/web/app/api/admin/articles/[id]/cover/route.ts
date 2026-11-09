import { ipoSinghApiOrigin } from "@/lib/api/ipo-singh";
import { NextResponse } from "next/server";

const articleId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 5_000_000;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!articleId.test(id) || !imageTypes.has(type)) {
    return NextResponse.json({ code: "validation_error", message: "Request validation failed." }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) {
    return NextResponse.json({ code: "validation_error", message: "Upload a PNG, JPEG, or WebP image under 5 MB." }, { status: 400 });
  }
  const origin = ipoSinghApiOrigin(process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return NextResponse.json({ code: "unavailable", message: "Administration is temporarily unavailable." }, { status: 503 });
  const headers = new Headers({ accept: "application/json", "content-type": type });
  const cookie = request.headers.get("cookie");
  const csrf = request.headers.get("x-csrf-token");
  if (cookie) headers.set("cookie", cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  const alt = new URL(request.url).searchParams.get("alt");
  const target = new URL(`/api/v1/admin/articles/${id}/cover`, origin);
  if (alt) target.searchParams.set("alt", alt);
  const response = await fetch(target, {
    method: "POST",
    headers,
    body: bytes,
    cache: "no-store",
    redirect: "manual",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  if (!articleId.test(id)) {
    return NextResponse.json({ code: "validation_error", message: "Request validation failed." }, { status: 400 });
  }
  const origin = ipoSinghApiOrigin(process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return NextResponse.json({ code: "unavailable", message: "Administration is temporarily unavailable." }, { status: 503 });
  const headers = new Headers({ accept: "application/json" });
  const cookie = request.headers.get("cookie");
  const csrf = request.headers.get("x-csrf-token");
  if (cookie) headers.set("cookie", cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(new URL(`/api/v1/admin/articles/${id}/cover`, origin), {
    method: "DELETE",
    headers,
    cache: "no-store",
    redirect: "manual",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
