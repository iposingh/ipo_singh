import { parseAdSlides, type AdSlide } from "./ads.ts";

const houseSlides = [
  {
    id: "mainboard",
    title: "Mainboard IPOs",
    description: "Browse stored Mainboard issues. The list stays empty when none are stored.",
    href: "/ipos/mainboard",
    disclosure: null,
    image: {
      alt: "Green banner with three rising bars and an upward arrow",
      desktop: { src: "/promotions/mainboard-desktop.svg", width: 1200, height: 400 },
      mobile: { src: "/promotions/mainboard-mobile.svg", width: 780, height: 520 },
    },
  },
  {
    id: "sme",
    title: "SME IPOs",
    description: "SME issues stay on their own list, separate from Mainboard.",
    href: "/ipos/sme",
    disclosure: null,
    image: {
      alt: "Deep green banner with three rising bars and an upward arrow",
      desktop: { src: "/promotions/sme-desktop.svg", width: 1200, height: 400 },
      mobile: { src: "/promotions/sme-mobile.svg", width: 780, height: 520 },
    },
  },
  {
    id: "calendar",
    title: "IPO Calendar",
    description: "Opening, closing, allotment and listing dates in India Standard Time.",
    href: "/ipo-calendar",
    disclosure: null,
    image: {
      alt: "Green banner with a calendar graphic",
      desktop: { src: "/promotions/calendar-desktop.svg", width: 1200, height: 400 },
      mobile: { src: "/promotions/calendar-mobile.svg", width: 780, height: 520 },
    },
  },
] as const satisfies readonly AdSlide[];

/** IPO Singh house promotions. Paid slides are added later through the same parser. */
export function loadHouseAds(): readonly AdSlide[] {
  const parsed = parseAdSlides(houseSlides);
  return parsed ?? [];
}
