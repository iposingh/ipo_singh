export type AllotmentVerificationShape = {
  ipoId: string;
  verificationStatus: "unconfirmed" | "confirmed" | "failed" | "unsupported" | "inconclusive";
  allotmentConfirmed: boolean;
  verificationSource: string | null;
  verificationEvidence: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string;
  nextCheckAt: string | null;
  note: string;
};

export const allotmentVerificationLimitation =
  "No permitted structured public source is configured for automated allotment-result confirmation for this registrar. Registrar portals that require CAPTCHA or investor identifiers are not queried. Allotment Out stays unconfirmed until a verified source or audited administrator confirmation is stored.";

export function unsupportedAllotmentVerification(input: {
  ipoId: string;
  now: Date;
  nextCheckAt?: Date | null;
}): AllotmentVerificationShape {
  return {
    ipoId: input.ipoId,
    verificationStatus: "unsupported",
    allotmentConfirmed: false,
    verificationSource: null,
    verificationEvidence: null,
    verifiedAt: null,
    lastCheckedAt: input.now.toISOString(),
    nextCheckAt: input.nextCheckAt ? input.nextCheckAt.toISOString() : null,
    note: allotmentVerificationLimitation,
  };
}

export function adminConfirmAllotment(input: {
  ipoId: string;
  now: Date;
  auditor: string;
  evidenceNote: string;
}): AllotmentVerificationShape | { error: string } {
  const note = input.evidenceNote.trim();
  const auditor = input.auditor.trim();
  if (!auditor || auditor.length > 120) return { error: "Auditor identity is required." };
  if (note.length < 12 || note.length > 500) return { error: "An evidence note between 12 and 500 characters is required." };
  return {
    ipoId: input.ipoId,
    verificationStatus: "confirmed",
    allotmentConfirmed: true,
    verificationSource: `admin:${auditor}`,
    verificationEvidence: note,
    verifiedAt: input.now.toISOString(),
    lastCheckedAt: input.now.toISOString(),
    nextCheckAt: null,
    note: "Confirmed by administrator audit. Automated verification was not used.",
  };
}
