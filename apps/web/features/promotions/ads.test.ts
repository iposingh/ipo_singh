import assert from "node:assert/strict";
import test from "node:test";
import { autoplayAllowed, disclosureLabel, nextSlideIndex, parseAdSlides } from "./ads.ts";
import { loadHouseAds } from "./house-ads.ts";
import { choosePromotionSlides } from "./select.ts";

const image = {
  alt: "Green banner",
  desktop: { src: "/promotions/mainboard-desktop.svg", width: 1200, height: 400 },
  mobile: { src: "/promotions/mainboard-mobile.svg", width: 780, height: 520 },
};

test("house promotions stay internal and unlabeled", () => {
  const slides = loadHouseAds();
  assert.equal(slides.length >= 2, true);
  assert.equal(slides.every((slide) => slide.disclosure === null), true);
  assert.equal(slides.every((slide) => slide.href.startsWith("/")), true);
  assert.equal(slides.some((slide) => slide.href === "/ipos/mainboard"), true);
  assert.equal(slides.some((slide) => slide.href === "/ipos/sme"), true);
  assert.equal(new Set(slides.map((slide) => slide.id)).size, slides.length);
});

test("paid slides need a disclosure and https, and house slides reject external urls", () => {
  const paid = parseAdSlides([
    {
      id: "sponsor",
      title: "Example sponsor",
      description: "A future paid placement with its own destination.",
      href: "https://example.com/offer",
      disclosure: "sponsored",
      image,
    },
  ]);
  assert.equal(paid?.[0]?.disclosure, "sponsored");
  assert.equal(disclosureLabel("sponsored"), "Sponsored");
  assert.equal(disclosureLabel("advertisement"), "Advertisement");
  assert.equal(disclosureLabel(null), null);
  assert.equal(
    parseAdSlides([
      {
        id: "sponsor",
        title: "Example sponsor",
        description: "A future paid placement with its own destination.",
        href: "https://example.com/offer",
        disclosure: null,
        image,
      },
    ]),
    null,
  );
  assert.equal(
    parseAdSlides([
      {
        id: "house",
        title: "Mainboard IPOs",
        description: "Stored Mainboard issues on IPO Singh.",
        href: "https://example.com/offer",
        disclosure: null,
        image,
      },
    ]),
    null,
  );
  assert.equal(
    parseAdSlides([
      {
        id: "vendor",
        title: "Vendor offer",
        description: "A vendor address is not a house promotion.",
        href: "https://www.ipoguru.in/offer",
        disclosure: "advertisement",
        image,
      },
    ]),
    null,
  );
});

test("the public carousel uses managed banners and keeps house slides when none are managed", () => {
  const house = loadHouseAds();
  const slide = {
    id: "banner-0123456789abcdef",
    title: "Mainboard IPOs",
    description: "Browse stored Mainboard issues on IPO Singh.",
    href: "/ipos/mainboard",
    disclosure: null,
    image: {
      alt: "Mainboard IPOs",
      desktop: { src: "/api/promotions/media/image-0123456789abcdef", width: 1, height: 1 },
      mobile: { src: "/api/promotions/media/image-0123456789abcdef", width: 1, height: 1 },
    },
  };
  assert.equal(choosePromotionSlides(null, house).length, house.length);
  assert.equal(choosePromotionSlides({ managed: false, slides: [] }, house).length, house.length);
  assert.deepEqual(choosePromotionSlides({ managed: true, slides: [] }, house), []);
  assert.equal(choosePromotionSlides({ managed: true, slides: [slide] }, house)[0]?.id, slide.id);
  assert.equal(choosePromotionSlides({ managed: true, slides: [{ ...slide, href: "javascript:alert(1)" }] }, house).length, house.length);
  assert.equal(parseAdSlides([{ ...slide, image: { ...slide.image, desktop: { ...slide.image.desktop, src: "https://example.com/a.png" } } }]), null);
});

test("automatic movement pauses for reduced motion, focus, and an explicit pause", () => {
  assert.equal(nextSlideIndex(0, 3, 1), 1);
  assert.equal(nextSlideIndex(0, 3, -1), 2);
  const base = { count: 3, paused: false, reducedMotion: false, pointerPaused: false, focusPaused: false, pageHidden: false };
  assert.equal(autoplayAllowed(base), true);
  assert.equal(autoplayAllowed({ ...base, reducedMotion: true }), false);
  assert.equal(autoplayAllowed({ ...base, paused: true }), false);
  assert.equal(autoplayAllowed({ ...base, focusPaused: true }), false);
  assert.equal(autoplayAllowed({ ...base, pageHidden: true }), false);
  assert.equal(autoplayAllowed({ ...base, count: 1 }), false);
});
