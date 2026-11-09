import { AccountSessionModel } from "./account-session.ts";
import { AdminAuditModel } from "./admin-audit.ts";
import { AllotmentVerificationModel } from "./allotment-verification.ts";
import { AccountDeviceModel } from "./device.ts";
import { AccountUserModel } from "./user.ts";
import { CompanyModel } from "./company.ts";
import { FinancialStatementModel } from "./financial-statement.ts";
import { GmpHistoryWindowModel } from "./gmp-history-window.ts";
import { GmpObservationModel } from "./gmp-observation.ts";
import { IpoModel } from "./ipo.ts";
import { OfsIssueModel } from "./ofs-issue.ts";
import { UnlistedShareModel } from "./unlisted-share.ts";
import { ProviderUsageModel } from "./provider-usage.ts";
import { RegistrarModel } from "./registrar.ts";
import { SourceDocumentModel } from "./source-document.ts";
import { SubscriptionObservationModel } from "./subscription-observation.ts";
import { SyncRunModel } from "./sync-run.ts";
import { NotificationBaselineModel, NotificationModel } from "./notification.ts";
import { PushAttemptModel, PushTokenModel } from "./push-token.ts";
import { ArticleModel } from "./article.ts";
import { PromotionBannerModel, PromotionImageModel } from "./promotion.ts";
import { WatchlistModel } from "./watchlist.ts";

const indexedModels = [
  AccountUserModel,
  AdminAuditModel,
  AccountDeviceModel,
  AccountSessionModel,
  CompanyModel,
  IpoModel,
  AllotmentVerificationModel,
  OfsIssueModel,
  UnlistedShareModel,
  GmpObservationModel,
  GmpHistoryWindowModel,
  SubscriptionObservationModel,
  FinancialStatementModel,
  RegistrarModel,
  SourceDocumentModel,
  SyncRunModel,
  ProviderUsageModel,
  WatchlistModel,
  PromotionBannerModel,
  PromotionImageModel,
  ArticleModel,
  NotificationModel,
  NotificationBaselineModel,
  PushTokenModel,
  PushAttemptModel,
] as const;

export async function ensureIndexes(): Promise<void> {
  for (const model of indexedModels) {
    await model.createIndexes();
  }
}
