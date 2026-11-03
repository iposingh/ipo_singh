import { catalogueReadLimit, type PersistenceStore } from "../../db/repositories.ts";
import { PersistenceError } from "../../db/persistence-error.ts";
import { HttpError } from "../../shared/errors.ts";
import { toDirectoryRow, toIpo, type DirectoryRow } from "./present.ts";

export type DirectoryRead = {
  rows: DirectoryRow[];
  truncated: boolean;
};

function unavailable(error: unknown): never {
  if (error instanceof HttpError || error instanceof PersistenceError) throw error;
  throw new PersistenceError("IPO data is temporarily unavailable.");
}

function observationsByIpo<T extends { ipoId: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.ipoId) ?? [];
    list.push(row);
    grouped.set(row.ipoId, list);
  }
  return grouped;
}

async function loadLatestObservations<T extends { ipoId: string }>(
  repository: {
    listLatest?(now?: Date): Promise<T[]>;
    listCurrent?(now?: Date): Promise<T[]>;
    findByIpo(ipoId: string, now?: Date): Promise<T[]>;
  },
): Promise<Map<string, T[]> | null> {
  if (repository.listLatest) return observationsByIpo(await repository.listLatest());
  if (repository.listCurrent) return observationsByIpo(await repository.listCurrent());
  return null;
}

export async function readDirectory(store: PersistenceStore): Promise<DirectoryRead> {
  try {
    const [companies, ipos, gmpByIpo, subscriptionByIpo] = await Promise.all([
      store.companies.list(),
      store.ipos.list(),
      loadLatestObservations(store.gmp),
      loadLatestObservations(store.subscriptions),
    ]);
    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const registrarIds = [...new Set(ipos.map((ipo) => ipo.registrarId).filter((id): id is string => Boolean(id)))];
    const registrarRows =
      store.registrars.findByIds != null
        ? await store.registrars.findByIds(registrarIds)
        : (
            await Promise.all(registrarIds.map(async (id) => [id, await store.registrars.findById(id)] as const))
          ).flatMap((entry) => (entry[1] ? [entry[1]] : []));
    const registrarsById = new Map(registrarRows.map((row) => [row.id, row]));
    const truncated = ipos.length >= catalogueReadLimit;
    const rows: DirectoryRow[] = [];
    for (const ipo of ipos) {
      const company = companiesById.get(ipo.companyId);
      if (!company) throw new HttpError(503, "unavailable", "A stored IPO is missing its company record.");
      const gmp = gmpByIpo ? (gmpByIpo.get(ipo.id) ?? []) : await store.gmp.findByIpo(ipo.id);
      const subscription = subscriptionByIpo ? (subscriptionByIpo.get(ipo.id) ?? []) : await store.subscriptions.findByIpo(ipo.id);
      const registrar = ipo.registrarId ? (registrarsById.get(ipo.registrarId) ?? null) : null;
      rows.push(
        toDirectoryRow(
          toIpo({ ipo, company, gmp, subscription, financials: [], registrar, documents: [] }),
          company.symbol ?? null,
        ),
      );
    }
    return { rows, truncated };
  } catch (error) {
    unavailable(error);
  }
}

export async function readIpoBySlug(store: PersistenceStore, slug: string) {
  try {
    const ipo = await store.ipos.findBySlug(slug);
    if (!ipo) return null;
    const company = await store.companies.findById(ipo.companyId);
    if (!company) throw new HttpError(503, "unavailable", "A stored IPO is missing its company record.");
    const [gmp, gmpWindow, subscription, financials, documents, registrar] = await Promise.all([
      store.gmp.findByIpo(ipo.id),
      store.gmpWindows ? store.gmpWindows.findByIpo(ipo.id) : Promise.resolve(null),
      store.subscriptions.findByIpo(ipo.id),
      store.financials.findByCompany(ipo.companyId),
      store.sources.findByIpo(ipo.id),
      ipo.registrarId ? store.registrars.findById(ipo.registrarId) : Promise.resolve(null),
    ]);
    const financialSource = financials.reduce<typeof financials[number]["source"] | null>((chosen, row) => {
      if (!chosen || row.source.fetchedAt.getTime() >= chosen.fetchedAt.getTime()) return row.source;
      return chosen;
    }, null);
    return {
      ipo: toIpo({ ipo, company, gmp, subscription, financials, registrar, documents }),
      gmp,
      gmpWindow,
      subscription,
      financialSource,
      registrarSource: registrar?.source ?? null,
    };
  } catch (error) {
    unavailable(error);
  }
}
