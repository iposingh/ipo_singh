import {
  promotionEventAcceptedSchema,
  promotionEventRequestSchema,
  publicPromotionResponseSchema,
} from "@ipo-singh/contracts";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { DatabaseHandle } from "../db/handle.ts";
import { HttpError } from "../shared/errors.ts";
import { recordPromotionEvent } from "./events.ts";
import { bannerIsVisible } from "./publish.ts";
import { toPublicSlides } from "./publish.ts";
import type { BannerImageRecord } from "./records.ts";

const imageIdPattern = /^image-[a-f0-9]{16}$/;

async function imagesFor(database: DatabaseHandle, ids: readonly (string | null)[]): Promise<Map<string, BannerImageRecord>> {
  const map = new Map<string, BannerImageRecord>();
  const store = database.promotions;
  if (!store) return map;
  for (const id of ids) {
    if (!id || map.has(id)) continue;
    const image = await store.findImage(id);
    if (image) map.set(id, image);
  }
  return map;
}

export function createPromotionRouter(readDatabase: () => DatabaseHandle): Router {
  const router = Router();

  router.get("/", (req, res, next) => {
    void list(req, res, next, readDatabase);
  });
  router.post("/events", (req, res, next) => {
    void events(req, res, next);
  });
  router.get("/media/:id", (req, res, next) => {
    void media(req, res, next, readDatabase);
  });
  return router;
}

async function events(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = promotionEventRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "validation_error", "That promotion event was not accepted.");
    recordPromotionEvent(parsed.data.bannerId, parsed.data.event);
    res.status(202).json(promotionEventAcceptedSchema.parse({ accepted: true }));
  } catch (error) {
    next(error);
  }
}

async function list(_req: Request, res: Response, next: NextFunction, readDatabase: () => DatabaseHandle): Promise<void> {
  try {
    const database = readDatabase();
    const store = database.promotions;
    if (!store) {
      res.json(publicPromotionResponseSchema.parse({ placement: "home", managed: false, slides: [] }));
      return;
    }
    const banners = await store.list();
    const map = await imagesFor(
      database,
      banners.flatMap((banner) => [banner.desktopImageId, banner.mobileImageId]),
    );
    res.json(
      publicPromotionResponseSchema.parse({
        placement: "home",
        managed: banners.length > 0,
        slides: toPublicSlides({ banners, images: map, now: new Date() }),
      }),
    );
  } catch (error) {
    next(error);
  }
}

async function media(req: Request, res: Response, next: NextFunction, readDatabase: () => DatabaseHandle): Promise<void> {
  try {
    const id = req.params.id;
    if (typeof id !== "string" || !imageIdPattern.test(id)) throw new HttpError(404, "not_found", "That image was not found.");
    const store = readDatabase().promotions;
    if (!store) throw new HttpError(404, "not_found", "That image was not found.");
    const image = await store.findImage(id);
    if (!image) throw new HttpError(404, "not_found", "That image was not found.");
    const banner = await store.find(image.bannerId);
    if (!banner || !bannerIsVisible(banner, new Date())) throw new HttpError(404, "not_found", "That image was not found.");
    sendImage(res, image);
  } catch (error) {
    next(error);
  }
}

export function sendImage(res: Response, image: BannerImageRecord, cache: "public" | "private" = "public"): void {
  res.status(200);
  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Content-Length", String(image.data.length));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("Cache-Control", cache === "public" ? "public, max-age=300" : "private, no-store");
  res.end(image.data);
}
