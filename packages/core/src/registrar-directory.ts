/**
 * Verified registrar portals controlled by the registrar.
 * These are general allotment portals, not IPO-specific guessed links.
 * Aliases cover known renames (for example Link Intime → MUFG Intime).
 */

export type RegistrarDirectoryEntry = {
  id: string;
  names: readonly string[];
  /** General official allotment portal. The user may need to select the IPO. */
  portalUrl: string;
  /** Whether a modular allotment-result verifier exists for this registrar. */
  verificationAdapter: "kfin" | "mufg" | "bigshare" | null;
};

const directory: readonly RegistrarDirectoryEntry[] = [
  {
    id: "kfin",
    names: ["kfin", "kfintech", "kfin technologies", "karvy", "karvy fintech"],
    portalUrl: "https://ipostatus.kfintech.com/",
    verificationAdapter: "kfin",
  },
  {
    id: "mufg-intime",
    names: ["mufg intime", "mufg intime india", "link intime", "link intime india", "linkintime"],
    portalUrl: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
    verificationAdapter: "mufg",
  },
  {
    id: "bigshare",
    names: ["bigshare", "bigshare services", "bigshare services pvt", "bigshare services private"],
    /** Status-check portal that publishes the company dropdown in public HTML. */
    portalUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    verificationAdapter: "bigshare",
  },
];

export function normalizeRegistrarLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(limited|ltd|private|pvt|india|services|technologies|technology)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a registrar display name or slug to a unique directory entry. */
export function registrarEntryForName(name: string | null | undefined): RegistrarDirectoryEntry | null {
  if (!name) return null;
  const normalized = normalizeRegistrarLabel(name);
  if (!normalized) return null;
  const matches = directory.filter((entry) =>
    entry.names.some((alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized)),
  );
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

/** Match a registrar display name to a verified general portal. Returns null when identity is ambiguous. */
export function registrarPortalForName(name: string | null | undefined): string | null {
  return registrarEntryForName(name)?.portalUrl ?? null;
}

export function registrarDirectory(): readonly RegistrarDirectoryEntry[] {
  return directory;
}
