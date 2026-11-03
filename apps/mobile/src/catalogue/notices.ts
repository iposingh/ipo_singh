import { fallbackCacheNote, offlineCacheNote } from "./response-cache.ts";

export type ListNoticeInput = {
  phase: "loading" | "error" | "ready";
  message: string | null;
  cacheReason: "fresh" | "offline" | "fallback" | null;
  cacheNote: string | null;
};

export function boardListNotice(sections: readonly ListNoticeInput[]): string | null {
  if (sections.some((section) => section.cacheReason === "offline")) return offlineCacheNote;
  const kept = sections.find((section) => section.phase === "ready" && section.message);
  if (kept?.message) return kept.message;
  if (sections.some((section) => section.cacheReason === "fallback")) return fallbackCacheNote;
  return sections.find((section) => section.cacheNote)?.cacheNote ?? null;
}
