import { ipoSinghApiOrigin } from "@/lib/api/ipo-singh";
import { internalServiceHeaders } from "@/lib/api/internal-headers";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ code: "not_found", message: "That image was not found." }, { status: 404 });
  }
  const origin = ipoSinghApiOrigin(process.env.IPO_SINGH_API_ORIGIN);
  if (!origin) return NextResponse.json({ code: "unavailable", message: "News media is temporarily unavailable." }, { status: 503 });
  const response = await fetch(new URL(`/api/v1/articles/${slug}/cover`, origin), {
    headers: { ...internalServiceHeaders(), accept: "image/*" },
    cache: "no-store",
    redirect: "manual",
  });
  if (!response.ok) {
    return NextResponse.json({ code: "not_found", message: "That image was not found." }, { status: response.status === 404 ? 404 : 502 });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type") ?? "application/octet-stream";
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=300",
    },
  });
}
