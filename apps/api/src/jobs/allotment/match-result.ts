import { matchPublishedCompanies } from "@ipo-singh/core";
import type { PublishedCompany } from "./company-list.ts";
import type { AllotmentAdapterResult } from "./types.ts";

export function adapterResultFromCompanies(input: {
  registrarId: string;
  sourceUrl: string;
  now: Date;
  method: string;
  note: string;
  absentNote: string;
  issue: { companyName: string; aliases?: readonly string[]; registrarCompanyId?: string | null };
  companies: readonly PublishedCompany[];
}): AllotmentAdapterResult {
  const match = matchPublishedCompanies({
    companyName: input.issue.companyName,
    aliases: input.issue.aliases,
    registrarCompanyId: input.issue.registrarCompanyId,
    published: input.companies,
  });
  if (match.status === "matched") {
    return {
      outcome: "confirmed",
      registrarId: input.registrarId,
      sourceUrl: input.sourceUrl,
      observedAt: input.now.toISOString(),
      matchedName: match.matchedName,
      matchedCompanyId: match.matchedId,
      evidence: `Unique registrar company list entry: ${match.matchedName}${match.matchedId ? ` (${match.matchedId})` : ""}`,
      method: input.method,
      note: input.note,
    };
  }
  if (match.status === "ambiguous") {
    return {
      outcome: "inconclusive",
      registrarId: input.registrarId,
      sourceUrl: input.sourceUrl,
      observedAt: input.now.toISOString(),
      matchedName: null,
      matchedCompanyId: null,
      evidence: `Ambiguous registrar options: ${match.candidates.join("; ")}`,
      method: input.method,
      note: "Multiple published names matched; confirmation refused.",
    };
  }
  return {
    outcome: "not_confirmed",
    registrarId: input.registrarId,
    sourceUrl: input.sourceUrl,
    observedAt: input.now.toISOString(),
    matchedName: null,
    matchedCompanyId: null,
    evidence: null,
    method: input.method,
    note: input.absentNote,
  };
}
