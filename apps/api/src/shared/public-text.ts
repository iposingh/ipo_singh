/** Keep only an http(s) address with no embedded credentials. */
export function publicHttpUrl(value: string | null): string | null {
  if (value === null) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.href.length > 2_000) return null;
  return url.href;
}

/** Remove markup so stored text is rendered as text. */
export function publicPlainText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
}
