export type PushPlatform = "ios" | "android";

export type PushTokenStatus = "active" | "revoked" | "invalid";

/** Signed-in account owner, or unsigned-in installation principal. */
export type PushOwnerKind = "user" | "anonymous";

export type PushTokenRecord = {
  id: string;
  userId: string;
  deviceId: string;
  platform: PushPlatform;
  token: string;
  status: PushTokenStatus;
  ownerKind: PushOwnerKind;
  /** Anonymous installations: Allotment category. Authenticated owners use account preferences. */
  allotmentAlertsEnabled: boolean;
  /** Anonymous installations: Mainboard global opt-in (default off). */
  mainboardGlobalAlerts: boolean;
  /** Anonymous installations: SME watchlist opt-in (default off). */
  smeWatchlistAlerts: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  invalidAt: Date | null;
};

export type PushAttemptStatus = "sent" | "failed" | "invalid-token";

export type PushAttemptRecord = {
  id: string;
  notificationId: string;
  tokenId: string;
  userId: string;
  attempt: number;
  status: PushAttemptStatus;
  providerError: string | null;
  /** Expo push ticket id used later for receipt polling. Null when Expo did not return one. */
  ticketId: string | null;
  /** When a receipt has been applied for this ticket. */
  receiptCheckedAt: Date | null;
  createdAt: Date;
};

export type PushTokenRevocation = {
  userId: string;
  /** One device. Null revokes every active token for the user. */
  deviceId: string | null;
  /** Keeps this device when other sessions are ended, such as after a password change. */
  exceptDeviceId?: string;
};

export type PushTokenStore = {
  findByToken(token: string): Promise<PushTokenRecord | null>;
  insert(record: PushTokenRecord): Promise<void>;
  save(record: PushTokenRecord): Promise<void>;
  listActive(userId: string): Promise<PushTokenRecord[]>;
  /** Distinct user ids that currently have at least one active Expo push token. */
  listActiveUserIds(limit?: number): Promise<string[]>;
  /** Paginated distinct active owner ids for Mainboard global fan-out. */
  listActiveOwnerIds(afterId: string | null, limit: number): Promise<string[]>;
  revokeActive(input: PushTokenRevocation): Promise<number>;
  attemptsFor(notificationId: string, tokenId: string): Promise<PushAttemptRecord[]>;
  recordAttempt(record: PushAttemptRecord): Promise<void>;
  /** Sent attempts that still need an Expo receipt check. */
  listPendingReceipts(limit: number): Promise<PushAttemptRecord[]>;
  markReceiptChecked(attemptId: string, checkedAt: Date): Promise<void>;
  findTokenById(tokenId: string): Promise<PushTokenRecord | null>;
};
