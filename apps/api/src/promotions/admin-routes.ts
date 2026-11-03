import {
  adminBannerListSchema,
  adminBannerSchema,
  bannerReorderSchema,
  bannerWriteSchema,
  type AccountRole,
  type AdminAuditAction,
} from "@ipo-singh/contracts";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import type { Logger } from "../shared/logger.ts";
import type { AdminAuditStore } from "../accounts/audit.ts";
import { requireRole } from "../accounts/middleware.ts";
import { createAccountId } from "../accounts/tokens.ts";
import { bannerDestination } from "./destination.ts";
import { createBannerId, createImageId } from "./ids.ts";
import { inspectPromotionImage, promotionImageLimit } from "./images.ts";
import { toAdminBanner } from "./publish.ts";
import type { BannerImageRecord, BannerRecord, PromotionStore } from "./records.ts";
import { sendImage } from "./routes.ts";

const administrators = ["admin", "super-admin"] as const satisfies readonly AccountRole[];
const bannerIdPattern = /^banner-[a-f0-9]{16}$/;
const imageIdPattern = /^image-[a-f0-9]{16}$/;

export type BannerAdminDeps = {
  readDatabase: () => DatabaseHandle;
  readAudit: () => AdminAuditStore | undefined;
  logger: Logger;
};

function storeOrThrow(database: DatabaseHandle): PromotionStore {
  if (!database.promotions) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
  return database.promotions;
}

async function record(deps: BannerAdminDeps, actorUserId: string, outcome: "succeeded" | "denied", action: AdminAuditAction = "banner_change"): Promise<void> {
  const audit = deps.readAudit();
  if (!audit) throw new HttpError(503, "unavailable", "Administration is temporarily unavailable.");
  await audit.insert({
    id: createAccountId(),
    actorUserId,
    action,
    outcome,
    targetUserId: null,
    createdAt: new Date(),
  });
  deps.logger.info("admin_audit", { action, outcome, actorUserId, targetUserId: null });
}

function protect(deps: BannerAdminDeps) {
  const gate = requireRole(administrators);
  return (req: Request, res: Response, next: NextFunction): void => {
    gate(req, res, (error) => {
      if (error instanceof HttpError && error.status === 403 && req.auth?.kind === "user") {
        void record(deps, req.auth.userId, "denied", "access_denied")
          .then(() => next(error))
          .catch((auditError: unknown) => next(auditError));
        return;
      }
      next(error);
    });
  };
}

function actorId(req: Request): string {
  if (req.auth?.kind !== "user") throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return req.auth.userId;
}

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bannerId(value: string | undefined): string {
  if (!value || !bannerIdPattern.test(value)) throw new HttpError(404, "not_found", "That banner was not found.");
  return value;
}

async function imageMap(store: PromotionStore, banners: readonly BannerRecord[]): Promise<Map<string, BannerImageRecord>> {
  const map = new Map<string, BannerImageRecord>();
  for (const banner of banners) {
    for (const id of [banner.desktopImageId, banner.mobileImageId]) {
      if (!id || map.has(id)) continue;
      const image = await store.findImage(id);
      if (image) map.set(id, image);
    }
  }
  return map;
}

export function createBannerAdminRouter(deps: BannerAdminDeps): Router {
  const router = Router();
  const gate = protect(deps);
  router.get("/banners", gate, (req, res, next) => {
    void list(req, res, next, deps);
  });
  router.post("/banners", gate, (req, res, next) => {
    void create(req, res, next, deps);
  });
  router.post("/banners/reorder", gate, (req, res, next) => {
    void reorder(req, res, next, deps);
  });
  router.get("/banners/media/:id", gate, (req, res, next) => {
    void media(req, res, next, deps);
  });
  router.get("/banners/:id", gate, (req, res, next) => {
    void read(req, res, next, deps);
  });
  router.patch("/banners/:id", gate, (req, res, next) => {
    void update(req, res, next, deps);
  });
  router.post("/banners/:id/activate", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "active");
  });
  router.post("/banners/:id/deactivate", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "draft");
  });
  router.post("/banners/:id/archive", gate, (req, res, next) => {
    void setStatus(req, res, next, deps, "archived");
  });
  router.delete("/banners/:id", gate, (req, res, next) => {
    void remove(req, res, next, deps);
  });
  router.post(
    "/banners/:id/images",
    express.raw({
      limit: promotionImageLimit,
      type: (req) => {
        const type = String(req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
        return type === "image/png" || type === "image/jpeg" || type === "image/webp";
      },
    }),
    gate,
    (req, res, next) => {
      void upload(req, res, next, deps);
    },
  );
  return router;
}

async function list(_req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const banners = await store.list();
    const images = await imageMap(store, banners);
    res.json(adminBannerListSchema.parse({ banners: banners.map((banner) => toAdminBanner(banner, images)) }));
  } catch (error) {
    next(error);
  }
}

async function read(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const banner = await store.find(bannerId(param(req.params.id)));
    if (!banner) throw new HttpError(404, "not_found", "That banner was not found.");
    const images = await imageMap(store, [banner]);
    res.json(adminBannerSchema.parse(toAdminBanner(banner, images)));
  } catch (error) {
    next(error);
  }
}

async function create(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const actor = actorId(req);
    const parsed = bannerWriteSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    const destination = bannerDestination(parsed.data.destinationUrl, parsed.data.sponsored);
    if (!destination) throw new HttpError(400, "validation_error", "The destination URL is not allowed.");
    const existing = await store.list();
    const now = new Date();
    const banner: BannerRecord = {
      id: createBannerId(),
      title: parsed.data.title,
      description: parsed.data.description,
      desktopImageId: null,
      mobileImageId: null,
      destinationUrl: destination,
      placement: parsed.data.placement,
      priority: parsed.data.priority,
      status: "draft",
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : null,
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
      sponsored: parsed.data.sponsored,
      disclosure: parsed.data.disclosure,
      sortOrder: existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await store.insert(banner);
    await record(deps, actor, "succeeded");
    res.status(201).json(adminBannerSchema.parse(toAdminBanner(banner, new Map())));
  } catch (error) {
    next(error);
  }
}

async function update(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const actor = actorId(req);
    const current = await store.find(bannerId(param(req.params.id)));
    if (!current) throw new HttpError(404, "not_found", "That banner was not found.");
    if (current.status === "archived") throw new HttpError(409, "validation_error", "Archived banners stay archived.");
    const parsed = bannerWriteSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    const destination = bannerDestination(parsed.data.destinationUrl, parsed.data.sponsored);
    if (!destination) throw new HttpError(400, "validation_error", "The destination URL is not allowed.");
    const banner: BannerRecord = {
      ...current,
      title: parsed.data.title,
      description: parsed.data.description,
      destinationUrl: destination,
      placement: parsed.data.placement,
      priority: parsed.data.priority,
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : null,
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
      sponsored: parsed.data.sponsored,
      disclosure: parsed.data.disclosure,
      updatedAt: new Date(),
    };
    await store.save(banner);
    await record(deps, actor, "succeeded");
    const images = await imageMap(store, [banner]);
    res.json(adminBannerSchema.parse(toAdminBanner(banner, images)));
  } catch (error) {
    next(error);
  }
}

async function setStatus(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps, status: BannerRecord["status"]): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const actor = actorId(req);
    const current = await store.find(bannerId(param(req.params.id)));
    if (!current) throw new HttpError(404, "not_found", "That banner was not found.");
    if (current.status === "archived") throw new HttpError(409, "validation_error", "Archived banners stay archived.");
    if (status === "active" && (!current.desktopImageId || !current.mobileImageId)) {
      throw new HttpError(400, "validation_error", "Add a desktop image and a mobile image before activation.");
    }
    const banner = { ...current, status, updatedAt: new Date() };
    await store.save(banner);
    await record(deps, actor, "succeeded");
    const images = await imageMap(store, [banner]);
    res.json(adminBannerSchema.parse(toAdminBanner(banner, images)));
  } catch (error) {
    next(error);
  }
}

async function remove(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const actor = actorId(req);
    const current = await store.find(bannerId(param(req.params.id)));
    if (!current) throw new HttpError(404, "not_found", "That banner was not found.");
    if (current.status === "active") throw new HttpError(409, "validation_error", "Archive the banner before deleting it.");
    await store.deleteImagesForBanner(current.id);
    await store.remove(current.id);
    await record(deps, actor, "succeeded");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

async function reorder(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const actor = actorId(req);
    const parsed = bannerReorderSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "Request validation failed.");
    const banners = await store.list();
    const open = banners.filter((banner) => banner.status !== "archived");
    const expected = new Set(open.map((banner) => banner.id));
    if (parsed.data.ids.length !== expected.size || parsed.data.ids.some((id) => !expected.has(id)) || new Set(parsed.data.ids).size !== parsed.data.ids.length) {
      throw new HttpError(400, "validation_error", "Request validation failed.");
    }
    const now = new Date();
    for (const [index, id] of parsed.data.ids.entries()) {
      const banner = open.find((item) => item.id === id);
      if (!banner) continue;
      await store.save({ ...banner, sortOrder: index, updatedAt: now });
    }
    await record(deps, actor, "succeeded");
    const nextBanners = await store.list();
    const images = await imageMap(store, nextBanners);
    res.json(adminBannerListSchema.parse({ banners: nextBanners.map((banner) => toAdminBanner(banner, images)) }));
  } catch (error) {
    next(error);
  }
}

async function upload(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const store = storeOrThrow(deps.readDatabase());
    const actor = actorId(req);
    const current = await store.find(bannerId(param(req.params.id)));
    if (!current || current.status === "archived") throw new HttpError(404, "not_found", "That banner was not found.");
    const slot = req.query.slot === "desktop" || req.query.slot === "mobile" ? req.query.slot : null;
    if (!slot) throw new HttpError(400, "validation_error", "Request validation failed.");
    const type = String(req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "validation_error", "Upload a PNG, JPEG, or WebP image.");
    const inspected = inspectPromotionImage(type, req.body);
    if (!inspected) throw new HttpError(400, "validation_error", "Upload a PNG, JPEG, or WebP image.");
    const previousId = slot === "desktop" ? current.desktopImageId : current.mobileImageId;
    const image: BannerImageRecord = {
      id: createImageId(),
      bannerId: current.id,
      slot,
      contentType: inspected.contentType,
      width: inspected.width,
      height: inspected.height,
      byteLength: req.body.length,
      data: req.body,
      createdAt: new Date(),
    };
    await store.saveImage(image);
    const banner = {
      ...current,
      desktopImageId: slot === "desktop" ? image.id : current.desktopImageId,
      mobileImageId: slot === "mobile" ? image.id : current.mobileImageId,
      updatedAt: new Date(),
    };
    await store.save(banner);
    if (previousId) await store.deleteImage(previousId);
    await record(deps, actor, "succeeded");
    const images = await imageMap(store, [banner]);
    res.json(adminBannerSchema.parse(toAdminBanner(banner, images)));
  } catch (error) {
    next(error);
  }
}

async function media(req: Request, res: Response, next: NextFunction, deps: BannerAdminDeps): Promise<void> {
  try {
    const id = param(req.params.id);
    if (!id || !imageIdPattern.test(id)) throw new HttpError(404, "not_found", "That image was not found.");
    const store = storeOrThrow(deps.readDatabase());
    const image = await store.findImage(id);
    if (!image) throw new HttpError(404, "not_found", "That image was not found.");
    sendImage(res, image, "private");
  } catch (error) {
    next(error);
  }
}
