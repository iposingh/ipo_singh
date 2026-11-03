/**
 * Structured allotment-result verification outcomes.
 * Dropdown presence alone is never confirmation unless a registrar adapter documents that signal.
 */

import type { PublishedCompany } from "./company-list.ts";

export type AllotmentCheckOutcome = "confirmed" | "not_confirmed" | "inconclusive" | "unsupported" | "error";

export type AllotmentAdapterResult = {
  outcome: AllotmentCheckOutcome;
  registrarId: string;
  sourceUrl: string;
  observedAt: string;
  matchedName: string | null;
  matchedCompanyId: string | null;
  evidence: string | null;
  method: string;
  note: string;
};

export type AllotmentVerificationStatus = "unconfirmed" | "confirmed" | "failed" | "unsupported" | "inconclusive";

export type AllotmentNotificationDispatch = "not-sent" | "queued" | "sent" | "failed" | "skipped";

export type AllotmentVerificationRecord = {
  ipoId: string;
  registrarId: string | null;
  verificationStatus: AllotmentVerificationStatus;
  allotmentConfirmed: boolean;
  verificationSource: string | null;
  verificationEvidence: string | null;
  verificationMethod: string | null;
  sourceUrl: string | null;
  matchedCompanyId: string | null;
  verifiedAt: string | null;
  monitoringStartedAt: string | null;
  lastCheckedAt: string;
  nextCheckAt: string | null;
  note: string;
  notificationDispatch: AllotmentNotificationDispatch;
  notificationEligibleDevices: number | null;
  notificationAccepted: number | null;
  notificationRejected: number | null;
  errorName: string | null;
};

export type AllotmentVerifyIssue = {
  ipoId: string;
  slug: string;
  companyName: string;
  aliases?: readonly string[];
  status: "upcoming" | "open" | "closed" | "allotment" | "listed" | null;
  openDate: string | null;
  closeDate: string | null;
  allotmentDate: string | null;
  listingDate: string | null;
  listingConfirmed: boolean;
  allotmentConfirmed: boolean;
  registrarId: string | null;
  registrarName: string | null;
  allotmentUrl: string | null;
  registrarCompanyId?: string | null;
};

export type AllotmentVerifier = {
  registrarId: string;
  /** Fetch published issue labels once per tick when the registrar exposes a permitted list. */
  listPublishedIssues?(now: Date): Promise<{
    sourceUrl: string;
    names: readonly string[];
    companies?: readonly PublishedCompany[];
    note: string;
  }>;
  verify(input: {
    issue: AllotmentVerifyIssue;
    now: Date;
    publishedNames?: readonly string[] | null;
    publishedCompanies?: readonly PublishedCompany[] | null;
    sourceUrl?: string | null;
  }): Promise<AllotmentAdapterResult>;
};
