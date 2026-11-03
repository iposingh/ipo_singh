/** Server-only shared secret for Next.js → IPO Singh API. Never expose as NEXT_PUBLIC_*. */
export const internalServiceHeader = "x-ipo-singh-internal";

export function internalServiceHeaders(): HeadersInit {
  const token = process.env.IPO_SINGH_INTERNAL_SERVICE_TOKEN?.trim();
  if (!token) return {};
  return { [internalServiceHeader]: token };
}
