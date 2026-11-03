import { normalizeIssueLabel } from "@ipo-singh/core";
import type { RegistrarCompany, RegistrarCompanyListResult, PublishedCompany } from "../company-list.ts";
import { fetchRegistrarText } from "../fetch.ts";
import { adapterResultFromCompanies } from "../match-result.ts";
import type { AllotmentVerifier } from "../types.ts";

export const kfinPortalUrl = "https://ipostatus.kfintech.com/";

/**
 * KFin serves a React SPA. The active allotment company dropdown is initialized from a
 * `JSON.parse('[...]')` payload embedded in the publicly served main.*.js bundle.
 * Investor lookups are never automated.
 */

export function resolveKFinMainBundleUrl(html: string, baseUrl = kfinPortalUrl): string | null {
  const scripts = [...html.matchAll(/src=["']([^"']+\.js[^"']*)["']/gi)].map((match) => match[1] ?? "");
  const main = scripts.find((src) => /main\.[a-f0-9]+\.js/i.test(src)) ?? scripts.find((src) => /\/main[^/]*\.js/i.test(src));
  if (!main) return null;
  try {
    const resolved = new URL(main, baseUrl);
    if (resolved.protocol !== "https:") return null;
    const host = resolved.hostname.toLowerCase();
    if (host !== "ipostatus.kfintech.com" && !host.endsWith(".kfintech.com")) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/** Extract the company array embedded as JSON.parse('[{clientId,name},...]'). */
export function parseKFinCompaniesFromBundle(js: string): RegistrarCompany[] {
  const match = js.match(/JSON\.parse\(\s*'(\[{"clientId":[\s\S]*?\}\])'\s*\)/);
  if (!match?.[1]) {
    const alt = js.match(/JSON\.parse\(\s*"(\[{\\"clientId\\":[\s\S]*?\}\])"\s*\)/);
    if (!alt?.[1]) throw new Error("KFin company list payload was not found in the JavaScript bundle.");
    const parsed = JSON.parse(alt[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")) as unknown;
    return companiesFromJson(parsed);
  }
  // The payload is a JS single-quoted string; unescape common sequences before JSON.parse.
  const raw = match[1]
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
  const parsed = JSON.parse(raw) as unknown;
  return companiesFromJson(parsed);
}

function companiesFromJson(value: unknown): RegistrarCompany[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("KFin company list payload was empty or malformed.");
  }
  const companies: RegistrarCompany[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const clientId = "clientId" in row && (typeof row.clientId === "string" || typeof row.clientId === "number") ? String(row.clientId).trim() : "";
    const name = "name" in row && typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim() : "";
    if (!clientId || !name) continue;
    companies.push({ registrarCompanyId: clientId, name, normalizedName: normalizeIssueLabel(name) });
  }
  if (companies.length === 0) throw new Error("KFin company list contained no usable company rows.");
  return companies;
}

export async function fetchKFinCompanyList(deps?: {
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<RegistrarCompanyListResult> {
  const checkedAt = (deps?.now ?? new Date()).toISOString();
  try {
    const page = await fetchRegistrarText({
      url: kfinPortalUrl,
      timeoutMs: 15_000,
      fetchImpl: deps?.fetchImpl,
      headers: {
        accept: "text/html",
        referer: kfinPortalUrl,
      },
    });
    if (!page.ok) {
      return {
        registrar: "KFIN",
        status: "unavailable",
        companies: [],
        checkedAt,
        sourceUrl: kfinPortalUrl,
        errorCode: `http_${page.status}`,
        errorMessage: `KFin portal HTTP ${page.status}`,
      };
    }
    const bundleUrl = resolveKFinMainBundleUrl(page.body, page.url || kfinPortalUrl);
    if (!bundleUrl) {
      return {
        registrar: "KFIN",
        status: "error",
        companies: [],
        checkedAt,
        sourceUrl: kfinPortalUrl,
        errorCode: "bundle_missing",
        errorMessage: "KFin HTML did not reference a main JavaScript bundle.",
      };
    }
    const bundle = await fetchRegistrarText({
      url: bundleUrl,
      timeoutMs: 30_000,
      fetchImpl: deps?.fetchImpl,
      headers: {
        accept: "*/*",
        referer: kfinPortalUrl,
      },
    });
    if (!bundle.ok) {
      return {
        registrar: "KFIN",
        status: "unavailable",
        companies: [],
        checkedAt,
        sourceUrl: bundleUrl,
        errorCode: `http_${bundle.status}`,
        errorMessage: `KFin bundle HTTP ${bundle.status}`,
      };
    }
    if (/<!doctype html>/i.test(bundle.body.slice(0, 200)) && !bundle.body.includes("JSON.parse")) {
      return {
        registrar: "KFIN",
        status: "error",
        companies: [],
        checkedAt,
        sourceUrl: bundleUrl,
        errorCode: "bundle_html_fallback",
        errorMessage: "KFin returned HTML instead of the JavaScript bundle.",
      };
    }
    const companies = parseKFinCompaniesFromBundle(bundle.body);
    return {
      registrar: "KFIN",
      status: "success",
      companies,
      checkedAt,
      sourceUrl: bundleUrl,
    };
  } catch (error) {
    return {
      registrar: "KFIN",
      status: "error",
      companies: [],
      checkedAt,
      sourceUrl: kfinPortalUrl,
      errorCode: "parse_or_network",
      errorMessage: error instanceof Error ? error.message : "KFin company list fetch failed.",
    };
  }
}

export function createKFinAllotmentVerifier(deps?: {
  fetchImpl?: typeof fetch;
  list?: () => Promise<RegistrarCompanyListResult>;
}): AllotmentVerifier {
  return {
    registrarId: "kfin",
    async listPublishedIssues(now) {
      const listed = await (deps?.list ?? (() => fetchKFinCompanyList({ fetchImpl: deps?.fetchImpl, now })))();
      if (listed.status !== "success") {
        throw new Error(listed.errorMessage ?? "KFin company list unavailable.");
      }
      return {
        sourceUrl: listed.sourceUrl,
        names: listed.companies.map((row) => row.name),
        companies: listed.companies.map((row): PublishedCompany => ({ id: row.registrarCompanyId, name: row.name })),
        note: `Fetched KFin public company list (${listed.companies.length}) at ${listed.checkedAt}.`,
      };
    },
    async verify(input) {
      const sourceUrl = input.sourceUrl ?? kfinPortalUrl;
      let companies = input.publishedCompanies ?? null;
      let note = "Used a shared KFin company list for this tick.";
      try {
        if (!companies) {
          const listed = await this.listPublishedIssues?.(input.now);
          companies = listed?.companies ?? null;
          note = listed?.note ?? note;
        }
      } catch (error) {
        return {
          outcome: "error",
          registrarId: "kfin",
          sourceUrl,
          observedAt: input.now.toISOString(),
          matchedName: null,
          matchedCompanyId: null,
          evidence: null,
          method: "kfin-js-bundle-company-list",
          note: error instanceof Error ? error.message : "KFin list fetch failed.",
        };
      }
      return adapterResultFromCompanies({
        registrarId: "kfin",
        sourceUrl,
        now: input.now,
        method: "kfin-js-bundle-company-list",
        note,
        absentNote: "Company was not present in the KFin public allotment company list.",
        issue: input.issue,
        companies: companies ?? [],
      });
    },
  };
}
