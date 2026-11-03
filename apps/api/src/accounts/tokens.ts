import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const tokenBytes = 32;
const maxTokenLength = 128;

export function createAccountId(): string {
  return randomUUID();
}

/** Opaque secret returned once to the caller. Only its hash is stored. */
export function createToken(): string {
  return randomBytes(tokenBytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isTokenShape(token: string): boolean {
  return token.length > 0 && token.length <= maxTokenLength && /^[A-Za-z0-9_-]+$/.test(token);
}
