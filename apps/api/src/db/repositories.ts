import type {
  CompanyRecord,
  FinancialStatementRecord,
  GmpHistoryWindowRecord,
  GmpObservationRecord,
  GmpObservationWrite,
  IpoRecord,
  ProviderUsageRecord,
  ProviderUsageWrite,
  RegistrarRecord,
  SourceDocumentRecord,
  SubscriptionObservationRecord,
  SubscriptionObservationWrite,
  SyncRunRecord,
  SyncRunWrite,
} from "./records.ts";

/** One public catalogue read never scans more rows than this. */
export const catalogueReadLimit = 2_000;

export type CompanyRepository = {
  upsert(record: CompanyRecord): Promise<CompanyRecord>;
  findById(id: string): Promise<CompanyRecord | null>;
  findByName(name: string): Promise<CompanyRecord | null>;
  list(): Promise<CompanyRecord[]>;
};

export type IpoCatalogueCounts = {
  total: number;
  mainboard: number;
  sme: number;
  open: number;
  upcoming: number;
  listed: number;
  closed: number;
  allotment: number;
  statusMissing: number;
  /** False when the underlying scan hit the catalogue read ceiling. */
  complete: boolean;
};

export type IpoRepository = {
  upsert(record: IpoRecord): Promise<IpoRecord>;
  findById(id: string): Promise<IpoRecord | null>;
  findBySlug(slug: string): Promise<IpoRecord | null>;
  findByProvider(providerKey: string, externalId: string): Promise<IpoRecord | null>;
  list(): Promise<IpoRecord[]>;
  /** Dashboard counts without loading full IPO documents. */
  summarizeCounts?(): Promise<IpoCatalogueCounts>;
  /** Bounded admin inspection list (slug filter, limited rows). */
  listForInspection?(input: { query: string; limit: number }): Promise<IpoRecord[]>;
};

export type GmpRepository = {
  upsert(record: GmpObservationWrite): Promise<GmpObservationRecord>;
  findByIpo(ipoId: string, now?: Date): Promise<GmpObservationRecord[]>;
  /** Current observations for the catalogue. Absent stores still use one read per IPO. */
  listCurrent?(now?: Date): Promise<GmpObservationRecord[]>;
  /** Latest observation per IPO for directory summaries. Prefer over listCurrent for catalogue builds. */
  listLatest?(now?: Date): Promise<GmpObservationRecord[]>;
};

export type GmpWindowRepository = {
  upsert(record: GmpHistoryWindowRecord): Promise<GmpHistoryWindowRecord>;
  findByIpo(ipoId: string): Promise<GmpHistoryWindowRecord | null>;
};

export type SubscriptionRepository = {
  upsert(record: SubscriptionObservationWrite): Promise<SubscriptionObservationRecord>;
  findByIpo(ipoId: string, now?: Date): Promise<SubscriptionObservationRecord[]>;
  /** Current observations for the catalogue. Absent stores still use one read per IPO. */
  listCurrent?(now?: Date): Promise<SubscriptionObservationRecord[]>;
  /** Latest observation per IPO for directory summaries. */
  listLatest?(now?: Date): Promise<SubscriptionObservationRecord[]>;
};

export type FinancialRepository = {
  upsert(record: FinancialStatementRecord): Promise<FinancialStatementRecord>;
  findByCompany(companyId: string): Promise<FinancialStatementRecord[]>;
};

export type RegistrarRepository = {
  upsert(record: RegistrarRecord): Promise<RegistrarRecord>;
  findById(id: string): Promise<RegistrarRecord | null>;
  findByIds?(ids: readonly string[]): Promise<RegistrarRecord[]>;
};

export type SourceDocumentRepository = {
  upsert(record: SourceDocumentRecord): Promise<SourceDocumentRecord>;
  findByIpo(ipoId: string): Promise<SourceDocumentRecord[]>;
};

export type SyncRepository = {
  upsert(record: SyncRunWrite): Promise<SyncRunRecord>;
  findByProvider(providerKey: string, now?: Date): Promise<SyncRunRecord[]>;
};

export type UsageRepository = {
  upsert(record: ProviderUsageWrite): Promise<ProviderUsageRecord>;
  findByProvider(providerKey: string, now?: Date): Promise<ProviderUsageRecord[]>;
};

export type PersistenceStore = {
  companies: CompanyRepository;
  ipos: IpoRepository;
  gmp: GmpRepository;
  /** Source high, low, and whether the vendor clipped or locked the series. */
  gmpWindows?: GmpWindowRepository;
  subscriptions: SubscriptionRepository;
  financials: FinancialRepository;
  registrars: RegistrarRepository;
  sources: SourceDocumentRepository;
  sync: SyncRepository;
  usage: UsageRepository;
};
