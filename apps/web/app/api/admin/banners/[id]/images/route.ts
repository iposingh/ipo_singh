import { ipoSinghApiOrigin } from "@/lib/api/ipo-singh";
import { NextResponse } from "next/server";

const bannerId = /^banner-[a-f0-9]{16}$/;
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 800_000;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const slot = new URL(request.url).searchParams.get("slot");
  const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!bannerId.test(id) || (slot !== "desktop" && slot !== "mobile") || !imageTypes.has(type)) {
    return NextResponse.json({ code: "validation_error", message: "Request validation failed." }, { status: 400 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) {
    return NextResponse.json({ code: "validation_error", message: "Upload a PNG, JPEG, or WebP image." }, { status: 400 });
  }
  const origin = ipoSinghApiOrigin(process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return NextResponse.json({ code: "unavailable", message: "Administration is temporarily unavailable." }, { status: 503 });
  const headers = new Headers({ accept: "application/json", "content-type": type });
  const cookie = request.headers.get("cookie");
  const csrf = request.headers.get("x-csrf-token");
  if (cookie) headers.set("cookie", cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(new URL(`/api/v1/admin/banners/${id}/images?slot=${slot}`, origin), {
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
