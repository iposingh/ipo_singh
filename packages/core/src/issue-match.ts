/**
 * Strict company/issue name matching against a registrar's published list.
 * Harmless formatting differences are normalized. Broad fuzzy matching is refused.
 */

export type IssueMatchResult =
  | { status: "matched"; matchedName: string; matchedId: string | null }
  | { status: "ambiguous"; candidates: readonly string[] }
  | { status: "none" };

const legalSuffixes =
  /\b(limited|ltd|private|pvt|pvt ltd|private limited|llp|opc|company|co|india)\b/g;

/** Collapse punctuation, case, spaces, -IPO tags, and common legal suffixes for comparison. */
export function normalizeIssueLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[-\s]*ipo\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(legalSuffixes, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Require a unique normalized equality match.
 * Substring inclusion alone is not enough when more than one published name matches.
 */
export function matchPublishedIssueName(input: {
  companyName: string;
  aliases?: readonly string[];
  publishedNames: readonly string[];
}): IssueMatchResult {
  return matchPublishedCompanies({
    companyName: input.companyName,
    aliases: input.aliases,
    published: input.publishedNames.map((name) => ({ id: "", name })),
  });
}

/**
 * Conservative matching hierarchy:
 * 1. Previously verified registrar company ID (unique)
 * 2. Exact normalized company-name match
 * 3. Explicit aliases
 * Ambiguous multi-hits require manual review.
 */
export function matchPublishedCompanies(input: {
  companyName: string;
  aliases?: readonly string[];
  registrarCompanyId?: string | null;
  published: readonly { id: string; name: string }[];
}): IssueMatchResult {
  if (input.registrarCompanyId) {
    const byId = input.published.filter((row) => row.id && row.id === input.registrarCompanyId);
    if (byId.length === 1) {
      return { status: "matched", matchedName: byId[0]!.name.trim(), matchedId: byId[0]!.id };
    }
    if (byId.length > 1) {
      return { status: "ambiguous", candidates: byId.map((row) => row.name.trim()).sort() };
    }
  }

  const targets = [input.companyName, ...(input.aliases ?? [])]
    .map((name) => normalizeIssueLabel(name))
    .filter((name) => name.length > 0);
  if (targets.length === 0) return { status: "none" };

  const hits = new Map<string, { name: string; id: string }>();
  for (const published of input.published) {
    const normalized = normalizeIssueLabel(published.name);
    if (!normalized) continue;
    if (targets.some((target) => target === normalized)) {
      hits.set(normalized, { name: published.name.trim(), id: published.id });
    }
  }
  if (hits.size === 1) {
    const matched = [...hits.values()][0]!;
    return { status: "matched", matchedName: matched.name, matchedId: matched.id || null };
  }
  if (hits.size > 1) return { status: "ambiguous", candidates: [...hits.values()].map((row) => row.name).sort() };
  return { status: "none" };
}
