/**
 * Read-only live registrar company-list probe.
 * Does not confirm IPOs, does not write Mongo, and does not bypass TLS/CAPTCHA.
 *
 *   node --experimental-strip-types src/jobs/allotment/live-registrar-probe.ts
 */
import {
  createBigshareAllotmentVerifier,
  createKFinAllotmentVerifier,
  createMUFGAllotmentVerifier,
} from "./adapters/index.ts";

type ProbeRow = {
  registrar: string;
  ok: boolean;
  companyCount: number;
  sampleIds: string[];
  sourceUrl: string | null;
  error: string | null;
  authorizationNote: string;
};

const authorizationNotes: Record<string, string> = {
  kfin:
    "Public allotment-status portal retrieved read-only. Automated monitoring still requires confirming KFin usage terms / authorization before production polling.",
  "mufg-intime":
    "Public GetDetails endpoint retrieved read-only. Automated monitoring still requires confirming MUFG Intime usage terms / authorization before production polling.",
  bigshare:
    "Public IPO status HTML retrieved read-only. Automated monitoring still requires confirming Bigshare usage terms / authorization before production polling.",
};

async function probe(
  registrar: string,
  run: () => Promise<{ companies: { id: string; name: string }[]; sourceUrl: string }>,
): Promise<ProbeRow> {
  try {
    const listed = await run();
    return {
      registrar,
      ok: true,
      companyCount: listed.companies.length,
      sampleIds: listed.companies.slice(0, 3).map((row) => row.id),
      sourceUrl: listed.sourceUrl,
      error: null,
      authorizationNote: authorizationNotes[registrar] ?? "Confirm registrar authorization before production use.",
    };
  } catch (error) {
    return {
      registrar,
      ok: false,
      companyCount: 0,
      sampleIds: [],
      sourceUrl: null,
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      authorizationNote: authorizationNotes[registrar] ?? "Confirm registrar authorization before production use.",
    };
  }
}

async function main(): Promise<void> {
  const kfin = createKFinAllotmentVerifier();
  const mufg = createMUFGAllotmentVerifier();
  const bigshare = createBigshareAllotmentVerifier();
  const now = new Date();

  const rows = await Promise.all([
    probe("kfin", async () => {
      const listed = await kfin.listPublishedIssues!(now);
      return {
        sourceUrl: listed.sourceUrl,
        companies: (listed.companies ?? []).map((row) => ({ id: row.id, name: row.name })),
      };
    }),
    probe("mufg-intime", async () => {
      const listed = await mufg.listPublishedIssues!(now);
      return {
        sourceUrl: listed.sourceUrl,
        companies: (listed.companies ?? []).map((row) => ({ id: row.id, name: row.name })),
      };
    }),
    probe("bigshare", async () => {
      const listed = await bigshare.listPublishedIssues!(now);
      return {
        sourceUrl: listed.sourceUrl,
        companies: (listed.companies ?? []).map((row) => ({ id: row.id, name: row.name })),
      };
    }),
  ]);

  console.log(JSON.stringify({ ok: rows.every((row) => row.ok), checkedAt: now.toISOString(), registrars: rows }, null, 2));
  if (!rows.every((row) => row.ok)) process.exit(1);
}

await main();
