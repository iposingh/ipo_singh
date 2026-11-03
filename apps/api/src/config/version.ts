import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function readPackageVersion(): string {
  const candidates = [
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    fileURLToPath(new URL("../package.json", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const parsed: unknown = JSON.parse(readFileSync(candidate, "utf8"));
    if (typeof parsed !== "object" || parsed === null || !("name" in parsed) || !("version" in parsed)) continue;
    if (parsed.name === "@ipo-singh/api" && typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  }

  throw new Error("API package version is missing");
}
