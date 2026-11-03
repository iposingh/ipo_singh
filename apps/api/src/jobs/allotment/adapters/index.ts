import { registrarEntryForName } from "@ipo-singh/core";
import { createBigshareAllotmentVerifier } from "./bigshare.ts";
import { createKFinAllotmentVerifier } from "./kfin.ts";
import { createMUFGAllotmentVerifier } from "./mufg.ts";
import type { AllotmentVerifier } from "../types.ts";

export function createAllotmentVerifiers(deps?: {
  fetchHtml?: (url: string) => Promise<string>;
  fetchImpl?: typeof fetch;
}): Record<string, AllotmentVerifier> {
  return {
    kfin: createKFinAllotmentVerifier({ fetchImpl: deps?.fetchImpl }),
    "mufg-intime": createMUFGAllotmentVerifier({ fetchImpl: deps?.fetchImpl }),
    bigshare: createBigshareAllotmentVerifier({ fetchHtml: deps?.fetchHtml, fetchImpl: deps?.fetchImpl }),
  };
}

export function resolveVerifierId(input: {
  registrarId: string | null;
  registrarName: string | null;
}): string | null {
  if (input.registrarId && ["kfin", "mufg-intime", "bigshare"].includes(input.registrarId)) {
    return input.registrarId;
  }
  const entry = registrarEntryForName(input.registrarName) ?? registrarEntryForName(input.registrarId);
  return entry?.verificationAdapter === "kfin"
    ? "kfin"
    : entry?.verificationAdapter === "mufg"
      ? "mufg-intime"
      : entry?.verificationAdapter === "bigshare"
        ? "bigshare"
        : null;
}

export {
  createBigshareAllotmentVerifier,
  bigsharePortalUrl,
  parseBigshareCompanyOptions,
  parseBigshareCompaniesFromHtml,
  bigshareVerifyFromHtml,
  fetchBigshareCompanyList,
} from "./bigshare.ts";
export {
  createKFinAllotmentVerifier,
  kfinPortalUrl,
  parseKFinCompaniesFromBundle,
  resolveKFinMainBundleUrl,
  fetchKFinCompanyList,
} from "./kfin.ts";
export {
  createMUFGAllotmentVerifier,
  mufgPortalUrl,
  mufgGetDetailsUrl,
  parseMufgGetDetailsPayload,
  fetchMufgCompanyList,
} from "./mufg.ts";
