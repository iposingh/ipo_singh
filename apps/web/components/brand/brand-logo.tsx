import Image from "next/image";
import { cn } from "@/lib/cn";

const LOGO_WIDTH = 918;
const LOGO_HEIGHT = 307;

export const brandLogoAlt = "IPO Singh. All IPO insights. One place.";

type BrandLogoProps = {
  /** CSS pixel width. Height follows the artwork ratio. Omit for the responsive default. */
  width?: number;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ width, className, priority = false }: BrandLogoProps) {
  return (
    <span
      className={cn(
        /* Horizontal lockup has a light plate; dark mode keeps a compact white cradle so brand greens are not recolored. */
        "inline-flex max-w-full align-middle dark:rounded-control dark:border dark:border-border dark:bg-white dark:px-2.5 dark:py-1.5 dark:shadow-card",
        className,
      )}
    >
      <Image
        src="/brand/logo-horizontal.png"
        alt={brandLogoAlt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        sizes={width ? `${width}px` : "(min-width: 1024px) 320px, (min-width: 640px) 240px, 176px"}
        className={cn("h-auto max-w-full", width ? undefined : "w-44 sm:w-60 lg:w-80")}
        style={width ? { width, height: "auto" } : undefined}
      />
    </span>
  );
}
