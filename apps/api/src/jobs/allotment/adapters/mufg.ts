import { normalizeIssueLabel } from "@ipo-singh/core";
import type { PublishedCompany, RegistrarCompany, RegistrarCompanyListResult } from "../company-list.ts";
import { fetchRegistrarText } from "../fetch.ts";
import { adapterResultFromCompanies } from "../match-result.ts";
import type { AllotmentVerifier } from "../types.ts";

export const mufgPortalUrl = "https://in.mpms.mufg.com/Initial_Offer/public-issues.html";
export const mufgGetDetailsUrl = "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/GetDetails";

/**
 * MUFG Intime exposes a public ASP.NET JSON endpoint that returns the allotment company list
 * as XML inside `{ d: "<NewDataSet>..." }` without submitting investor credentials.
 *
 * Investor-result lookups remain CAPTCHA-protected and are never automated.
 * `generateToken` is not used: it is not required for GetDetails and must not be treated as a reusable credential.
 */

export function parseMufgGetDetailsPayload(payload: unknown): RegistrarCompany[] {
  if (!payload || typeof payload !== "object" || !("d" in payload) || typeof (payload as { d: unknown }).d !== "string") {
    throw new Error("MUFG GetDetails response was missing the XML payload.");
  }
  const xml = (payload as { d: string }).d;
  if (!xml.includes("<NewDataSet") && !xml.includes("<Table")) {
    throw new Error("MUFG GetDetails XML payload was malformed.");
  }
  const tables = [...xml.matchAll(/<Table>([\s\S]*?)<\/Table>/gi)];
  if (tables.length === 0) throw new Error("MUFG GetDetails XML contained no company tables.");
  const companies: RegistrarCompany[] = [];
  for (const table of tables) {
    const block = table[1] ?? "";
    const id = block.match(/<company_id>([\s\S]*?)<\/company_id>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
    const nameRaw =
      block.match(/<companyname>([\s\S]*?)<\/companyname>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() ??
      "";
    if (!id || !nameRaw) continue;
    companies.push({
      registrarCompanyId: id,
      name: nameRaw,
      normalizedName: normalizeIssueLabel(nameRaw),
    });
  }
  if (companies.length === 0) throw new Error("MUFG GetDetails XML contained no usable company rows.");
  return companies;
}

export async function fetchMufgCompanyList(deps?: {
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<RegistrarCompanyListResult> {
  const checkedAt = (deps?.now ?? new Date()).toISOString();
  try {
    const response = await fetchRegistrarText({
      url: mufgGetDetailsUrl,
      method: "POST",
      body: "{}",
      timeoutMs: 15_000,
      fetchImpl: deps?.fetchImpl,
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/json; charset=utf-8",
        "x-requested-with": "XMLHttpRequest",
        origin: "https://in.mpms.mufg.com",
        referer: mufgPortalUrl,
      },
    });
    if (!response.ok) {
      return {
        registrar: "MUFG",
        status: "unavailable",
        companies: [],
        checkedAt,
        sourceUrl: mufgGetDetailsUrl,
        errorCode: `http_${response.status}`,
        errorMessage: `MUFG GetDetails HTTP ${response.status}`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(response.body) as unknown;
    } catch {
      return {
        registrar: "MUFG",
        status: "error",
        companies: [],
        checkedAt,
        sourceUrl: mufgGetDetailsUrl,
        errorCode: "invalid_json",
        errorMessage: "MUFG GetDetails response was not JSON.",
      };
    }
    const companies = parseMufgGetDetailsPayload(json);
    return {
      registrar: "MUFG",
      status: "success",
      companies,
      checkedAt,
      sourceUrl: mufgGetDetailsUrl,
    };
  } catch (error) {
    return {
      registrar: "MUFG",
      status: "error",
      companies: [],
      checkedAt,
      sourceUrl: mufgGetDetailsUrl,
      errorCode: "parse_or_network",
      errorMessage: error instanceof Error ? error.message : "MUFG company list fetch failed.",
    };
  }
}

export function createMUFGAllotmentVerifier(deps?: {
  fetchImpl?: typeof fetch;
  list?: () => Promise<RegistrarCompanyListResult>;
}): AllotmentVerifier {
  return {
    registrarId: "mufg-intime",
    async listPublishedIssues(now) {
      const listed = await (deps?.list ?? (() => fetchMufgCompanyList({ fetchImpl: deps?.fetchImpl, now })))();
      if (listed.status !== "success") {
        throw new Error(listed.errorMessage ?? "MUFG company list unavailable.");
      }
      return {
        sourceUrl: listed.sourceUrl,
        names: listed.companies.map((row) => row.name),
        companies: listed.companies.map((row): PublishedCompany => ({ id: row.registrarCompanyId, name: row.name })),
        note: `Fetched MUFG public company list (${listed.companies.length}) at ${listed.checkedAt}.`,
      };
    },
    async verify(input) {
      const sourceUrl = input.sourceUrl ?? mufgGetDetailsUrl;
      let companies = input.publishedCompanies ?? null;
      let note = "Used a shared MUFG company list for this tick.";
      try {
        if (!companies) {
          const listed = await this.listPublishedIssues?.(input.now);
          companies = listed?.companies ?? null;
          note = listed?.note ?? note;
        }
      } catch (error) {
        return {
          outcome: "error",
          registrarId: "mufg-intime",
          sourceUrl,
          observedAt: input.now.toISOString(),
          matchedName: null,
          matchedCompanyId: null,
          evidence: null,
          method: "mufg-getdetails-xml",
          note: error instanceof Error ? error.message : "MUFG list fetch failed.",
        };
      }
      return adapterResultFromCompanies({
        registrarId: "mufg-intime",
        sourceUrl,
        now: input.now,
        method: "mufg-getdetails-xml",
        note,
        absentNote: "Company was not present in the MUFG public allotment company list.",
        issue: input.issue,
        companies: companies ?? [],
      });
    },
  };
}
