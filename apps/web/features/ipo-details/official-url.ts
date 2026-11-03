import { verifiedAllotmentUrl } from "@ipo-singh/core";

/** Official registrar links only. Other schemes, credentials, and empty values are rejected. */
export function officialHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** A verified KFin, MUFG Intime, or Bigshare allotment page. A registrar website is not a substitute. */
export function officialAllotmentUrl(input: {
  name?: string | null;
  allotmentUrl?: string | null;
}): string | null {
  return verifiedAllotmentUrl({
    name: input.name,
    statusPage: officialHttpUrl(input.allotmentUrl),
  });
}
