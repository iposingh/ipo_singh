/**
 * Shared registrar company-list shapes for allotment verification adapters.
 * Names and IDs come only from official registrar responses — never fabricated.
 */

export type RegistrarCompany = {
  registrarCompanyId: string;
  name: string;
  normalizedName: string;
};

export type RegistrarCompanyListResult = {
  registrar: "KFIN" | "MUFG" | "BIGSHARE";
  status: "success" | "unavailable" | "unsupported" | "error";
  companies: readonly RegistrarCompany[];
  checkedAt: string;
  sourceUrl: string;
  errorCode?: string;
  errorMessage?: string;
};

export type PublishedCompany = {
  id: string;
  name: string;
};
