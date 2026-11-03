import { z } from "zod";
import { boardSchema } from "./board.ts";
import { timestampSchema } from "./primitives.ts";

/** One IPO Singh person. Web and mobile share this id. It is not an IPO id. */
export const accountIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

export const accountEmailSchema = z.string().trim().toLowerCase().email().max(254);

export const accountLifecycleSchema = z.enum(["pending", "active", "suspended", "closed"]);

/** `member` is a User. Administrators are created only by bootstrap or a super admin. */
export const accountRoleSchema = z.enum(["member", "admin", "super-admin"]);

export const accountClientSchema = z.enum(["web", "ios", "android"]);

export const accountColorSchemeSchema = z.enum(["system", "light", "dark"]);

/** Stored choices only. IPO Singh does not send email for these categories. */
export const accountNotificationCategoriesSchema = z
  .object({
    open: z.boolean(),
    closing: z.boolean(),
    gmp: z.boolean(),
    subscription: z.boolean(),
    allotment: z.boolean(),
    listing: z.boolean(),
    schedule: z.boolean(),
    announcement: z.boolean(),
  })
  .strict();

/** How a future watchlist should be shown. It does not create a watchlist. */
export const accountWatchlistDisplaySchema = z
  .object({
    density: z.enum(["comfortable", "compact"]),
    showGmp: z.boolean(),
    showSubscription: z.boolean(),
    showDates: z.boolean(),
  })
  .strict();

/** Expo push choice. The device token is stored separately and is not part of this object. */
export const accountMobilePushSchema = z.enum(["off", "when-available"]);

/** Display and alert preferences. They do not include PAN, brokerage, or market data. */
export const accountPreferencesSchema = z
  .object({
    colorScheme: accountColorSchemeSchema,
    defaultBoard: boardSchema.nullable(),
    timeZone: z.literal("Asia/Kolkata"),
    alertsEnabled: z.boolean(),
    /**
     * Opt into Mainboard IPO alerts for eligible devices.
     * Mainboard delivery is global (no watchlist). Defaults off until the user opts in.
     */
    mainboardGlobalAlerts: z.boolean(),
    /**
     * Opt into SME IPO alerts. SME delivery always requires that specific IPO on the watchlist.
     */
    smeWatchlistAlerts: z.boolean(),
    notificationCategories: accountNotificationCategoriesSchema,
    watchlistDisplay: accountWatchlistDisplaySchema,
    mobilePush: accountMobilePushSchema,
  })
  .strict();

const notificationDefaults = {
  open: false,
  closing: false,
  gmp: false,
  subscription: false,
  allotment: false,
  listing: false,
  schedule: false,
  announcement: false,
} as const satisfies z.infer<typeof accountNotificationCategoriesSchema>;

export const defaultAccountPreferences = {
  colorScheme: "system",
  defaultBoard: null,
  timeZone: "Asia/Kolkata",
  alertsEnabled: false,
  mainboardGlobalAlerts: false,
  smeWatchlistAlerts: false,
  notificationCategories: notificationDefaults,
  watchlistDisplay: {
    density: "comfortable",
    showGmp: true,
    showSubscription: true,
    showDates: true,
  },
  mobilePush: "off",
} as const satisfies z.infer<typeof accountPreferencesSchema>;

/** A partial preference update. The time zone stays Asia/Kolkata. */
export const updateAccountPreferencesSchema = z
  .object({
    colorScheme: accountColorSchemeSchema.optional(),
    defaultBoard: boardSchema.nullable().optional(),
    timeZone: z.literal("Asia/Kolkata").optional(),
    alertsEnabled: z.boolean().optional(),
    mainboardGlobalAlerts: z.boolean().optional(),
    smeWatchlistAlerts: z.boolean().optional(),
    notificationCategories: accountNotificationCategoriesSchema.partial().strict().optional(),
    watchlistDisplay: accountWatchlistDisplaySchema.partial().strict().optional(),
    mobilePush: accountMobilePushSchema.optional(),
  })
  .strict();

export const updateDisplayNameSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(128),
  })
  .strict();

export const revokeSessionRequestSchema = z
  .object({
    sessionId: accountIdSchema,
  })
  .strict();

export const accountRevokeReasonSchema = z.enum(["user", "rotation_reuse", "suspended", "closed", "operator", "expired"]);

/** A password for a new account. Login accepts a wider string so a bad guess is not a different error. */
export const accountPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Include a letter and a number.")
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), "Remove hidden characters.");

/** Stable install id from Expo SecureStore. Optional so the website keeps working without it. */
export const accountInstallationIdSchema = accountIdSchema;

export const registerAccountRequestSchema = z
  .object({
    email: accountEmailSchema,
    password: accountPasswordSchema,
    displayName: z.string().trim().min(1).max(80).optional(),
    installationId: accountInstallationIdSchema.optional(),
  })
  .strict();

export const loginAccountRequestSchema = z
  .object({
    email: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128),
    installationId: accountInstallationIdSchema.optional(),
  })
  .strict();

/** Field message for a new password. Null means the password meets the rules. */
export function accountPasswordIssue(password: string, email?: string): string | null {
  if (password.length < 12 || password.length > 128) return "Use 12 to 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include a letter and a number.";
  if (/[\u0000-\u001F\u007F]/.test(password)) return "Remove hidden characters.";
  const local = email?.trim().toLowerCase().split("@")[0] ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "Do not include your email in the password.";
  return null;
}

/**
 * Public account payload. Token hashes, cookies, and credential material are not fields.
 * Extra keys such as PAN or a brokerage id are rejected.
 */
export const publicAccountSchema = z
  .object({
    id: accountIdSchema,
    email: accountEmailSchema.nullable(),
    displayName: z.string().trim().min(1).max(80).nullable(),
    status: accountLifecycleSchema,
    role: accountRoleSchema,
    preferences: accountPreferencesSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    statusChangedAt: timestampSchema,
    lastAuthenticatedAt: timestampSchema.nullable(),
  })
  .strict();

export const publicDeviceSchema = z
  .object({
    id: accountIdSchema,
    client: accountClientSchema,
    label: z.string().trim().min(1).max(80).nullable(),
    createdAt: timestampSchema,
    lastSeenAt: timestampSchema,
    revokedAt: timestampSchema.nullable(),
  })
  .strict();

/** A session the signed-in person may see. The access and refresh secrets are not included. */
export const publicSessionSchema = z
  .object({
    id: accountIdSchema,
    deviceId: accountIdSchema,
    client: accountClientSchema,
    createdAt: timestampSchema,
    accessExpiresAt: timestampSchema,
    refreshExpiresAt: timestampSchema,
    revokedAt: timestampSchema.nullable(),
    current: z.boolean(),
  })
  .strict();

export const accountSessionResponseSchema = z
  .object({
    account: publicAccountSchema,
    sessions: z.array(publicSessionSchema).max(20),
    devices: z.array(publicDeviceSchema).max(20),
  })
  .strict();

/** Cookie names for the website. Mobile does not use these. */
export const authCookieNames = {
  access: "ipo_singh_access",
  refresh: "ipo_singh_refresh",
  csrf: "ipo_singh_csrf",
} as const;

/** Header the website sends back on a cookie-authenticated mutation. */
export const authCsrfHeader = "x-csrf-token";

/**
 * Expo SecureStore keys for the same access and refresh secrets.
 * The mobile app must not copy these into AsyncStorage or a web localStorage.
 */
export const mobileSecureStoreKeys = {
  access: "ipo-singh.access-token",
  refresh: "ipo-singh.refresh-token",
} as const;

/**
 * Native clients send this header. The website proxy does not.
 * Browsers cannot send it to the API because it is not a CORS allowed header.
 */
export const mobileAuthClientHeader = "x-ipo-singh-client";

const opaqueTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** Same opaque secrets as the cookies. Returned only for an ios or android client. */
export const mobileSessionGrantSchema = z
  .object({
    account: publicAccountSchema,
    accessToken: opaqueTokenSchema,
    refreshToken: opaqueTokenSchema,
  })
  .strict();

/** Refresh body for a native client that has no refresh cookie. */
export const mobileRefreshRequestSchema = z
  .object({
    refreshToken: opaqueTokenSchema,
  })
  .strict();

export const accessTokenTtlMs = 15 * 60 * 1000;
export const refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000;

export type AccountId = z.infer<typeof accountIdSchema>;
export type AccountLifecycle = z.infer<typeof accountLifecycleSchema>;
export type AccountRole = z.infer<typeof accountRoleSchema>;
export type AccountClient = z.infer<typeof accountClientSchema>;
export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;
export type PublicAccount = z.infer<typeof publicAccountSchema>;
export type PublicDevice = z.infer<typeof publicDeviceSchema>;
export type PublicSession = z.infer<typeof publicSessionSchema>;
export type AccountRevokeReason = z.infer<typeof accountRevokeReasonSchema>;
export type MobileSessionGrant = z.infer<typeof mobileSessionGrantSchema>;
