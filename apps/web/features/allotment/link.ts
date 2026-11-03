import { officialAllotmentUrl } from "../ipo-details/official-url.ts";

export type AllotmentLink = { href: string | null; note: string; specific: boolean };

/** A stored registrar URL is used only after the official-host check. Nothing is guessed. */
export function allotmentLink(
  url: string | null | undefined,
  options?: { confirmed?: boolean; registrarName?: string | null },
): AllotmentLink {
  const href = officialAllotmentUrl({ name: options?.registrarName, allotmentUrl: url });
  if (!href) {
    return { href: null, specific: false, note: "No verified registrar allotment link is stored, so Check Allotment stays disabled." };
  }
  let specific = false;
  try {
    specific = new URL(href).search.length > 1;
  } catch {
    specific = false;
  }
  if (options?.confirmed === true) {
    return {
      href,
      specific,
      note: specific
        ? "Allotment out. Check Allotment opens the verified registrar page for this issue. Sign-in is not required."
        : "Allotment out. Check Allotment opens the verified registrar allotment portal. Sign-in is not required.",
    };
  }
  return {
    href,
    specific,
    note: specific
      ? "Results may still be pending. Check Allotment opens the verified registrar page for this issue. Sign-in is not required."
      : "Results may still be pending. Check Allotment opens the registrar allotment portal. You may need to select this IPO there. Sign-in is not required.",
  };
}
