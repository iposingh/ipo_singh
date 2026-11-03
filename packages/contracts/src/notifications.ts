import { z } from "zod";
import { accountIdSchema, accountNotificationCategoriesSchema } from "./account.ts";
import { paginationSchema } from "./api.ts";
import { stableIdSchema, timestampSchema } from "./primitives.ts";

/** In-app events. Email and SMS are not channels. */
export const notificationTypeSchema = z.enum([
  "open",
  "closing",
  "allotment",
  "listing",
  "gmp",
  "subscription",
  "schedule",
  "announcement",
]);

/** Push stays not-sent until a device token is registered and the worker attempts delivery. */
export const notificationPushStateSchema = z.enum(["not-sent", "sent", "failed", "skipped"]);

export const notificationDeliverySchema = z
  .object({
    inApp: z.literal("delivered"),
    push: notificationPushStateSchema,
  })
  .strict();

export const notificationSchema = z
  .object({
    id: accountIdSchema,
    type: notificationTypeSchema,
    ipoId: stableIdSchema.nullable(),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    createdAt: timestampSchema,
    readAt: timestampSchema.nullable(),
    expiresAt: timestampSchema,
    delivery: notificationDeliverySchema,
  })
  .strict();

export const notificationListSchema = z
  .object({
    items: z.array(notificationSchema).max(50),
    page: paginationSchema,
  })
  .strict();

export const unreadNotificationCountSchema = z
  .object({
    unreadCount: z.number().int().nonnegative().max(100),
  })
  .strict();

/** Alert switches only. A push token, email address, or phone number is rejected. */
export const updateAlertPreferencesSchema = z
  .object({
    alertsEnabled: z.boolean().optional(),
    notificationCategories: accountNotificationCategoriesSchema.partial().strict().optional(),
  })
  .strict();

/** An Expo push token. It is not an email address and it is not stored on the preference object. */
export const expoPushTokenSchema = z.string().regex(/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{8,160}\]$/);

export const registerPushTokenSchema = z
  .object({
    token: expoPushTokenSchema,
    platform: z.enum(["ios", "android"]),
  })
  .strict();

export const revokePushTokenSchema = z
  .object({
    token: expoPushTokenSchema,
  })
  .strict();

export const pushTokenRegistrationSchema = z
  .object({
    registered: z.literal(true),
  })
  .strict();

/**
 * Privacy-conscious device installation id for unsigned-in Expo push registration.
 * It is a random UUID generated on device; it is not a PAN, email, or account id.
 */
export const deviceInstallationIdSchema = accountIdSchema;

export const registerDevicePushTokenSchema = z
  .object({
    installationId: deviceInstallationIdSchema,
    token: expoPushTokenSchema,
    platform: z.enum(["ios", "android"]),
    allotmentAlertsEnabled: z.boolean().optional(),
    mainboardGlobalAlerts: z.boolean().optional(),
    smeWatchlistAlerts: z.boolean().optional(),
  })
  .strict();

export const revokeDevicePushTokenSchema = z
  .object({
    installationId: deviceInstallationIdSchema,
    token: expoPushTokenSchema,
  })
  .strict();

export const updateDevicePushPreferencesSchema = z
  .object({
    installationId: deviceInstallationIdSchema,
    allotmentAlertsEnabled: z.boolean().optional(),
    mainboardGlobalAlerts: z.boolean().optional(),
    smeWatchlistAlerts: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.allotmentAlertsEnabled !== undefined ||
      value.mainboardGlobalAlerts !== undefined ||
      value.smeWatchlistAlerts !== undefined,
    { message: "At least one device preference is required." },
  );

export const devicePushPreferencesSchema = z
  .object({
    allotmentAlertsEnabled: z.boolean(),
    mainboardGlobalAlerts: z.boolean(),
    smeWatchlistAlerts: z.boolean(),
  })
  .strict();

/** Guest/anonymous device watchlist row keyed by installation id. */
export const deviceWatchlistSaveSchema = z
  .object({
    installationId: deviceInstallationIdSchema,
    ipoId: z.string().trim().min(1).max(80),
  })
  .strict();

export const deviceWatchlistRemoveSchema = z
  .object({
    installationId: deviceInstallationIdSchema,
    ipoId: z.string().trim().min(1).max(80),
  })
  .strict();

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationItem = z.infer<typeof notificationSchema>;
export type NotificationPushState = z.infer<typeof notificationPushStateSchema>;
