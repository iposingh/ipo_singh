import Image from "next/image";
import { cn } from "@/lib/cn";

const marks = {
  only: {
    src: "/brand/icon-only.png",
    width: 310,
    height: 310,
    alt: "IPO Singh icon, three rising bars and an upward arrow",
  },
  light: {
    src: "/brand/icon-light.png",
    width: 298,
    height: 298,
    alt: "IPO Singh app icon for light backgrounds",
  },
  dark: {
    src: "/brand/icon-dark.png",
    width: 314,
    height: 314,
    alt: "IPO Singh app icon for dark backgrounds",
  },
} as const;

/** Prepared square files so these sizes render 1:1 instead of scaling a smaller bitmap. */
const preparedIconSizes = {
  32: "/brand/icon-32.png",
  48: "/brand/icon-48.png",
  192: "/brand/icon-192.png",
  512: "/brand/icon-512.png",
} as const;

export type BrandMarkVariant = keyof typeof marks;

type BrandMarkProps = {
  variant?: BrandMarkVariant;
  /** CSS pixel size. Width and height stay equal, so the artwork is not stretched. */
  size?: number;
  className?: string;
};

function preparedIcon(size: number): string | undefined {
  if (size === 32 || size === 48 || size === 192 || size === 512) return preparedIconSizes[size];
  return undefined;
}

export function BrandMark({ variant = "only", size = 48, className }: BrandMarkProps) {
  const mark = marks[variant];
  const prepared = variant === "only" ? preparedIcon(size) : undefined;
  const intrinsic = prepared ? size : mark.width;
  return (
    <Image
      src={prepared ?? mark.src}
      alt={mark.alt}
      width={intrinsic}
      height={intrinsic}
      sizes={`${size}px`}
      className={cn("max-w-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
