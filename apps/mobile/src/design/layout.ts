import { breakpoint, layout, spacing } from "@ipo-singh/design-tokens";

/** Horizontal page padding from the same breakpoints as the website. */
export function pagePadding(width: number): number {
  if (width >= breakpoint.lg) return layout.pagePaddingDesktop;
  if (width >= breakpoint.md) return layout.pagePaddingTablet;
  return layout.pagePaddingMobile;
}

export function screenContentInset(width: number): {
  paddingHorizontal: number;
  maxWidth: number;
  paddingTop: number;
  paddingBottom: number;
  gap: number;
} {
  return {
    paddingHorizontal: pagePadding(width),
    maxWidth: layout.contentMaxWidth,
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[4],
  };
}
