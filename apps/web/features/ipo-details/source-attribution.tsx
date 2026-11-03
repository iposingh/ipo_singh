import { formatIstDateTime } from "@ipo-singh/core";

/** Visible IPO Guru credit. The link is not marked nofollow or sponsored. */
export function SourceAttribution({ retrievedAt, sourceName }: { retrievedAt: string | null; sourceName?: string | null }) {
  const named = sourceName ? sourceName.toLowerCase().includes("ipo guru") : true;
  if (!named) return null;
  const date = retrievedAt ? new Date(retrievedAt) : null;
  const stamp = date && !Number.isNaN(date.getTime()) ? formatIstDateTime(date) : null;
  return (
    <p className="border-t border-border pt-4 text-sm text-foreground">
      <a href="https://ipoguru.in" className="font-medium text-foreground underline">
        Data by IPO Guru
      </a>
      <span className="text-muted">
        {" "}
        · {stamp && stamp !== "Unavailable" ? <>Updated <time dateTime={retrievedAt ?? undefined}>{stamp}</time></> : "Source update time unavailable"}
      </span>
    </p>
  );
}

export function latestRetrievedAt(values: readonly (string | null | undefined)[]): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || value > latest) latest = value;
  }
  return latest;
}
