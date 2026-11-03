import { normalizeIssueLabel } from "@ipo-singh/core";
import type { PublishedCompany, RegistrarCompany, RegistrarCompanyListResult } from "../company-list.ts";
import { fetchRegistrarText } from "../fetch.ts";
import { adapterResultFromCompanies } from "../match-result.ts";
import type { AllotmentAdapterResult, AllotmentVerifier } from "../types.ts";

export const bigsharePortalUrl = "https://ipo.bigshareonline.com/ipo_status.html";

/**
 * Bigshare publishes company options in public HTML on `select#ddlCompany`.
 * HTML comments are stripped before parsing so commented-out options cannot confirm an IPO.
 * Investor-result lookup still requires application identifiers and is never automated.
 */

export function parseBigshareCompaniesFromHtml(html: string): RegistrarCompany[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const selectMatch =
    withoutComments.match(/<select[^>]*\bid\s*=\s*["']ddlCompany["'][^>]*>[\s\S]*?<\/select>/i) ??
    withoutComments.match(/<select[^>]*>[\s\S]*?--\s*Select Company\s*--[\s\S]*?<\/select>/i);
  if (!selectMatch?.[0]) {
    throw new Error("Bigshare company select#ddlCompany was not found.");
  }
  const companies: RegistrarCompany[] = [];
  for (const match of selectMatch[0].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const attrs = match[1] ?? "";
    if (/\bdisabled\b/i.test(attrs)) continue;
    const value = attrs.match(/\bvalue\s*=\s*["']?([^"'\s>]+)["']?/i)?.[1]?.trim() ?? "";
    const label = (match[2] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!label || /^--/.test(label) || /select company/i.test(label)) continue;
    if (/^(english|hindi|marathi|gujrati|gujarati|telugu|bengali|tamil|kannada)$/i.test(label)) continue;
    if (!value || value === "0") continue;
    companies.push({
      registrarCompanyId: value,
      name: label,
      normalizedName: normalizeIssueLabel(label),
    });
  }
  return companies;
}

/** @deprecated Prefer parseBigshareCompaniesFromHtml for IDs; kept for existing name-only tests. */
export function parseBigshareCompanyOptions(html: string): string[] {
  try {
    return parseBigshareCompaniesFromHtml(html).map((row) => row.name);
  } catch {
    return [];
  }
}

export async function fetchBigshareCompanyList(deps?: {
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<RegistrarCompanyListResult> {
  const checkedAt = (deps?.now ?? new Date()).toISOString();
  try {
    const page = await fetchRegistrarText({
      url: bigsharePortalUrl,
      timeoutMs: 15_000,
      fetchImpl: deps?.fetchImpl,
      headers: {
        accept: "text/html,application/xhtml+xml",
        referer: bigsharePortalUrl,
      },
    });
    if (!page.ok) {
      return {
        registrar: "BIGSHARE",
        status: "unavailable",
        companies: [],
        checkedAt,
        sourceUrl: bigsharePortalUrl,
        errorCode: `http_${page.status}`,
        errorMessage: `Bigshare HTTP ${page.status}`,
      };
    }
    const companies = parseBigshareCompaniesFromHtml(page.body);
    return {
      registrar: "BIGSHARE",
      status: "success",
      companies,
      checkedAt,
      sourceUrl: bigsharePortalUrl,
    };
  } catch (error) {
    return {
      registrar: "BIGSHARE",
      status: "error",
      companies: [],
      checkedAt,
      sourceUrl: bigsharePortalUrl,
      errorCode: "parse_or_network",
      errorMessage: error instanceof Error ? error.message : "Bigshare company list fetch failed.",
    };
  }
}

export function createBigshareAllotmentVerifier(deps?: {
  fetchHtml?: (url: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  list?: () => Promise<RegistrarCompanyListResult>;
}): AllotmentVerifier {
  return {
    registrarId: "bigshare",
    async listPublishedIssues(now) {
      if (deps?.list) {
        const listed = await deps.list();
        if (listed.status !== "success") throw new Error(listed.errorMessage ?? "Bigshare company list unavailable.");
        return {
          sourceUrl: listed.sourceUrl,
          names: listed.companies.map((row) => row.name),
          companies: listed.companies.map((row): PublishedCompany => ({ id: row.registrarCompanyId, name: row.name })),
          note: `Fetched Bigshare public company list (${listed.companies.length}) at ${listed.checkedAt}.`,
        };
      }
      if (deps?.fetchHtml) {
        const html = await deps.fetchHtml(bigsharePortalUrl);
        const companies = parseBigshareCompaniesFromHtml(html);
        return {
          sourceUrl: bigsharePortalUrl,
          names: companies.map((row) => row.name),
          companies: companies.map((row) => ({ id: row.registrarCompanyId, name: row.name })),
          note: `Fetched Bigshare public company list at ${now.toISOString()}.`,
        };
      }
      const listed = await fetchBigshareCompanyList({ fetchImpl: deps?.fetchImpl, now });
      if (listed.status !== "success") throw new Error(listed.errorMessage ?? "Bigshare company list unavailable.");
      return {
        sourceUrl: listed.sourceUrl,
        names: listed.companies.map((row) => row.name),
        companies: listed.companies.map((row) => ({ id: row.registrarCompanyId, name: row.name })),
        note: `Fetched Bigshare public company list (${listed.companies.length}) at ${listed.checkedAt}.`,
      };
    },
    async verify(input) {
      const sourceUrl = input.sourceUrl ?? bigsharePortalUrl;
      let companies = input.publishedCompanies ?? null;
      let note = "Used a shared Bigshare company list for this tick.";
      try {
        if (!companies) {
          if (input.publishedNames) {
            companies = input.publishedNames.map((name) => ({ id: "", name }));
          } else {
            const listed = await this.listPublishedIssues?.(input.now);
            companies = listed?.companies ?? null;
            note = listed?.note ?? note;
          }
        }
      } catch (error) {
        return {
          outcome: "error",
          registrarId: "bigshare",
          sourceUrl,
          observedAt: input.now.toISOString(),
          matchedName: null,
          matchedCompanyId: null,
          evidence: null,
          method: "bigshare-html-company-select",
          note: error instanceof Error ? error.message : "Bigshare list fetch failed.",
        };
      }
      return adapterResultFromCompanies({
        registrarId: "bigshare",
        sourceUrl,
        now: input.now,
        method: "bigshare-html-company-select",
        note,
        absentNote: "Company was not present in the Bigshare public status-page company list.",
        issue: input.issue,
        companies: companies ?? [],
      });
    },
  };
}

export function bigshareVerifyFromHtml(input: {
  issue: { companyName: string; aliases?: readonly string[]; registrarCompanyId?: string | null };
  html: string;
  now: Date;
}): AllotmentAdapterResult {
  const companies = parseBigshareCompaniesFromHtml(input.html);
  return adapterResultFromCompanies({
    registrarId: "bigshare",
    sourceUrl: bigsharePortalUrl,
    now: input.now,
    method: "bigshare-html-company-select",
    note: "Parsed from provided HTML fixture.",
    absentNote: "Company was not present in the Bigshare public status-page company list.",
    issue: input.issue,
    companies: companies.map((row) => ({ id: row.registrarCompanyId, name: row.name })),
  });
}
