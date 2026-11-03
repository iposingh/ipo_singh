import { timingSafeEqual } from "node:crypto";

export function opsTokenMatches(expected: string | null, provided: string | undefined): boolean {
  if (!expected || !provided || provided.length > 128 || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
