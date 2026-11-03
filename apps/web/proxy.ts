import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiReportsMissingIpo, decideIpoProxyPath } from "@/lib/seo/ipo-status-proxy";
import { missingIpoHtml } from "@/lib/seo/missing-ipo-html";

function missingIpoResponse(): NextResponse {
  return new NextResponse(missingIpoHtml(), {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "private, no-store",
    },
  });
}

/**
 * IPO detail routes stream under Partial Prerendering, so `notFound()` alone can keep HTTP 200.
 * Known-missing addresses are answered here with a real 404 before the shell commits a status.
 */
export async function proxy(request: NextRequest) {
  const decision = decideIpoProxyPath(request.nextUrl.pathname);
  if (decision.action === "next") return NextResponse.next();
  if (decision.action === "missing") return missingIpoResponse();

  const isMissing = await apiReportsMissingIpo(decision.slug, process.env.IPO_SINGH_API_ORIGIN);
  if (isMissing) return missingIpoResponse();
  return NextResponse.next();
}

export const config = {
  matcher: ["/ipos/:slug", "/ipos/:slug/"],
};
