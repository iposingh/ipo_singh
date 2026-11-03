import { ipoSinghApiOrigin } from "@/lib/api/ipo-singh";
import { NextResponse } from "next/server";

const imageId = /^image-[a-f0-9]{16}$/;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  if (!imageId.test(id)) return NextResponse.json({ code: "not_found", message: "That image was not found." }, { status: 404 });
  const origin = ipoSinghApiOrigin(process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return NextResponse.json({ code: "unavailable", message: "Administration is temporarily unavailable." }, { status: 503 });
  const headers = new Headers({ accept: "image/png,image/jpeg,image/webp" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(new URL(`/api/v1/admin/banners/media/${id}`, origin), { headers, cache: "no-store", redirect: "manual" });
  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
