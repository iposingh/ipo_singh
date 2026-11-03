export type BannerStatus = "draft" | "active" | "archived";
export type BannerDisclosure = "sponsored" | "advertisement" | null;
export type ImageSlot = "desktop" | "mobile";
export type PromotionImageType = "image/png" | "image/jpeg" | "image/webp";

export type BannerRecord = {
  id: string;
  title: string;
  description: string;
  desktopImageId: string | null;
  mobileImageId: string | null;
  destinationUrl: string;
  placement: "home";
  priority: number;
  status: BannerStatus;
  startAt: Date | null;
  endAt: Date | null;
  sponsored: boolean;
  disclosure: BannerDisclosure;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type BannerImageRecord = {
  id: string;
  bannerId: string;
  slot: ImageSlot;
  contentType: PromotionImageType;
  width: number;
  height: number;
  byteLength: number;
  data: Buffer;
  createdAt: Date;
};

export type PromotionStore = {
  list(): Promise<BannerRecord[]>;
  find(id: string): Promise<BannerRecord | null>;
  insert(record: BannerRecord): Promise<void>;
  save(record: BannerRecord): Promise<void>;
  remove(id: string): Promise<boolean>;
  saveImage(image: BannerImageRecord): Promise<void>;
  findImage(id: string): Promise<BannerImageRecord | null>;
  deleteImage(id: string): Promise<void>;
  deleteImagesForBanner(bannerId: string): Promise<void>;
};
