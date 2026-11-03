import { publicHttpUrl, publicPlainText } from "../shared/public-text.ts";

/** Strip markup so article bodies stay text. No HTML rendering path. */
export function sanitizeArticleMarkdown(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function sanitizeArticlePlain(value: string): string {
  return publicPlainText(value);
}

export function sanitizeCitationUrl(value: string): string | null {
  const url = publicHttpUrl(value);
  if (!url || !url.startsWith("https://")) return null;
  return url;
}

/** Split sanitized markdown into readable paragraphs for clients that do not render markdown. */
export function articleParagraphs(bodyMarkdown: string): string[] {
  return sanitizeArticleMarkdown(bodyMarkdown)
    .split(/\n{2,}/)
    .map((part) => part.replace(/\n/g, " ").trim())
    .filter(Boolean);
}
