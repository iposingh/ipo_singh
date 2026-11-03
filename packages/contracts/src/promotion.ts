import { z } from "zod";
import { timestampSchema } from "./primitives.ts";

const bannerIdSchema = z.string().regex(/^banner-[a-f0-9]{16}$/);
const imageIdSchema = z.string().regex(/^image-[a-f0-9]{16}$/);
const plainText = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[^<>\u0000-\u001F]+$/);

const staticImageSrc = z.string().regex(/^\/promotions\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:svg|png|jpe?g|webp)$/);
const publicImageSrc = z.string().regex(/^\/api\/promotions\/media\/image-[a-f0-9]{16}$/);
const adminImageSrc = z.string().regex(/^\/api\/admin\/banners\/media\/image-[a-f0-9]{16}$/);

function slideSchema(src: z.ZodType<string>) {
  const size = z
    .object({
      src,
      width: z.number().int().min(1).max(4000),
      height: z.number().int().min(1).max(4000),
    })
    .strict();
  return z
    .object({
      id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: plainText(2, 80),
      description: plainText(8, 180),
      href: z.string().trim().min(1).max(500),
      disclosure: z.enum(["advertisement", "sponsored"]).nullable(),
      image: z
        .object({
          alt: plainText(2, 120),
          desktop: size,
          mobile: size,
        })
        .strict(),
    })
    .strict();
}

export const bannerPlacementSchema = z.enum(["home"]);
export const bannerStatusSchema = z.enum(["draft", "active", "archived"]);
export const bannerDisclosureSchema = z.enum(["sponsored", "advertisement"]);

export const bannerWriteSchema = z
  .object({
    title: plainText(2, 80),
    description: plainText(8, 180),
    destinationUrl: z.string().trim().min(1).max(500),
    placement: bannerPlacementSchema,
    priority: z.number().int().min(0).max(100),
    sponsored: z.boolean(),
    disclosure: bannerDisclosureSchema.nullable(),
    startAt: timestampSchema.nullable(),
    endAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sponsored && value.disclosure === null) {
      context.addIssue({ code: "custom", path: ["disclosure"], message: "A sponsored banner needs a label." });
    }
    if (!value.sponsored && value.disclosure !== null) {
      context.addIssue({ code: "custom", path: ["disclosure"], message: "A house banner has no paid label." });
    }
    if (value.startAt && value.endAt && Date.parse(value.endAt) <= Date.parse(value.startAt)) {
      context.addIssue({ code: "custom", path: ["endAt"], message: "The end is not after the start." });
    }
  });

export const bannerReorderSchema = z
  .object({
    ids: z.array(bannerIdSchema).min(1).max(50),
  })
  .strict();

export const publicPromotionSlideSchema = slideSchema(z.union([staticImageSrc, publicImageSrc]));
export const adminPromotionPreviewSchema = slideSchema(z.union([staticImageSrc, publicImageSrc, adminImageSrc]));

export const publicPromotionResponseSchema = z
  .object({
    placement: z.literal("home"),
    managed: z.boolean(),
    slides: z.array(publicPromotionSlideSchema).max(8),
  })
  .strict();

/** Aggregate-only promotion events. No account, device, or personal fields. */
export const promotionEventRequestSchema = z
  .object({
    bannerId: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    event: z.enum(["impression", "click"]),
    placement: z.literal("home"),
  })
  .strict();

export const promotionEventAcceptedSchema = z
  .object({
    accepted: z.literal(true),
  })
  .strict();

export const adminBannerSchema = z
  .object({
    id: bannerIdSchema,
    title: plainText(2, 80),
    description: plainText(8, 180),
    destinationUrl: z.string().trim().min(1).max(500),
    placement: bannerPlacementSchema,
    priority: z.number().int().min(0).max(100),
    status: bannerStatusSchema,
    startAt: timestampSchema.nullable(),
    endAt: timestampSchema.nullable(),
    sponsored: z.boolean(),
    disclosure: bannerDisclosureSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    desktopImageId: imageIdSchema.nullable(),
    mobileImageId: imageIdSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    preview: adminPromotionPreviewSchema.nullable(),
  })
  .strict();

export const adminBannerListSchema = z
  .object({
    banners: z.array(adminBannerSchema).max(50),
  })
  .strict();

export type BannerWrite = z.infer<typeof bannerWriteSchema>;
export type PublicPromotionResponse = z.infer<typeof publicPromotionResponseSchema>;
export type AdminBanner = z.infer<typeof adminBannerSchema>;
