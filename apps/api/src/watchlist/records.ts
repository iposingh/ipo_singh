export type WatchlistRecord = {
  id: string;
  userId: string;
  ipoId: string;
  addedAt: Date;
  note: string | null;
};

export type WatchlistStore = {
  listForUser(userId: string): Promise<WatchlistRecord[]>;
  /** One page of saved rows, ordered by id, after the previous page. */
  listBatch(afterId: string | null, limit: number): Promise<WatchlistRecord[]>;
  /** Users who saved one IPO. Used for targeted allotment alerts. */
  listByIpo(ipoId: string, limit?: number): Promise<WatchlistRecord[]>;
  find(userId: string, ipoId: string): Promise<WatchlistRecord | null>;
  /** Inserts one row. A repeated IPO id for the same user updates only the note. */
  save(record: WatchlistRecord, noteProvided: boolean): Promise<WatchlistRecord>;
  remove(userId: string, ipoId: string): Promise<boolean>;
  countAll(): Promise<number>;
};

export const watchlistItemLimit = 200;
