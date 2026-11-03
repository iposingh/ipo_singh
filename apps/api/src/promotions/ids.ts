import { randomBytes } from "node:crypto";

export function createBannerId(): string {
  return `banner-${randomBytes(8).toString("hex")}`;
}

export function createImageId(): string {
  return `image-${randomBytes(8).toString("hex")}`;
}
