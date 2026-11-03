/** Internal return path. Rejects protocol-relative and absolute URLs. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.includes("://")) return null;
  let url: URL;
  try {
    url = new URL(trimmed, "http://ipo-singh.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://ipo-singh.local") return null;
  if (url.pathname.startsWith("//")) return null;
  return `${url.pathname}${url.search}`;
}
