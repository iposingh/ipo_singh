import { AllotmentVerificationModel } from "../../db/models/allotment-verification.ts";
import { allotmentVerificationRecordSchema, type AllotmentVerificationStore, type StoredAllotmentVerification } from "./records.ts";

type Doc = {
  _id: string;
  registrarId: string | null;
  verificationStatus: StoredAllotmentVerification["verificationStatus"];
  allotmentConfirmed: boolean;
  verificationSource: string | null;
  verificationEvidence: string | null;
  verificationMethod: string | null;
  sourceUrl: string | null;
  matchedCompanyId: string | null;
  verifiedAt: Date | null;
  monitoringStartedAt: Date | null;
  lastCheckedAt: Date;
  nextCheckAt: Date | null;
  note: string;
  notificationDispatch: StoredAllotmentVerification["notificationDispatch"];
  notificationEligibleDevices: number | null;
  notificationAccepted: number | null;
  notificationRejected: number | null;
  errorName: string | null;
};

function fromDoc(doc: Doc): StoredAllotmentVerification {
  return allotmentVerificationRecordSchema.parse({
    ipoId: doc._id,
    registrarId: doc.registrarId,
    verificationStatus: doc.verificationStatus,
    allotmentConfirmed: doc.allotmentConfirmed,
    verificationSource: doc.verificationSource,
    verificationEvidence: doc.verificationEvidence,
    verificationMethod: doc.verificationMethod,
    sourceUrl: doc.sourceUrl,
    matchedCompanyId: doc.matchedCompanyId ?? null,
    verifiedAt: doc.verifiedAt ? doc.verifiedAt.toISOString() : null,
    monitoringStartedAt: doc.monitoringStartedAt ? doc.monitoringStartedAt.toISOString() : null,
    lastCheckedAt: doc.lastCheckedAt.toISOString(),
    nextCheckAt: doc.nextCheckAt ? doc.nextCheckAt.toISOString() : null,
    note: doc.note,
    notificationDispatch: doc.notificationDispatch,
    notificationEligibleDevices: doc.notificationEligibleDevices ?? null,
    notificationAccepted: doc.notificationAccepted ?? null,
    notificationRejected: doc.notificationRejected ?? null,
    errorName: doc.errorName,
  });
}

export function createMongoAllotmentVerificationStore(): AllotmentVerificationStore {
  return {
    async upsert(record) {
      const parsed = allotmentVerificationRecordSchema.parse(record);
      await AllotmentVerificationModel.findByIdAndUpdate(
        parsed.ipoId,
        {
          _id: parsed.ipoId,
          registrarId: parsed.registrarId,
          verificationStatus: parsed.verificationStatus,
          allotmentConfirmed: parsed.allotmentConfirmed,
          verificationSource: parsed.verificationSource,
          verificationEvidence: parsed.verificationEvidence,
          verificationMethod: parsed.verificationMethod,
          sourceUrl: parsed.sourceUrl,
          matchedCompanyId: parsed.matchedCompanyId,
          verifiedAt: parsed.verifiedAt ? new Date(parsed.verifiedAt) : null,
          monitoringStartedAt: parsed.monitoringStartedAt ? new Date(parsed.monitoringStartedAt) : null,
          lastCheckedAt: new Date(parsed.lastCheckedAt),
          nextCheckAt: parsed.nextCheckAt ? new Date(parsed.nextCheckAt) : null,
          note: parsed.note,
          notificationDispatch: parsed.notificationDispatch,
          notificationEligibleDevices: parsed.notificationEligibleDevices,
          notificationAccepted: parsed.notificationAccepted,
          notificationRejected: parsed.notificationRejected,
          errorName: parsed.errorName,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      return parsed;
    },
    async findByIpo(ipoId) {
      const document = (await AllotmentVerificationModel.findById(ipoId).lean()) as unknown as Doc | null;
      return document ? fromDoc(document) : null;
    },
    async list(limit = 200) {
      const documents = (await AllotmentVerificationModel.find({})
        .sort({ lastCheckedAt: -1 })
        .limit(Math.min(Math.max(limit, 1), 500))
        .lean()) as unknown as Doc[];
      return documents.map(fromDoc);
    },
  };
}
