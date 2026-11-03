import { boardBrowseTitle, boardLabel, statusLabel } from "../../features/ipos/labels.ts";
import { detailDescription, type SeoOffer } from "./copy.ts";

export type LinkedItem = {
  name: string;
  path: string;
};

type PropertyValue = {
  "@type": "PropertyValue";
  name: string;
  value: string | number;
  unitText?: "INR";
};

export type SeoIpo = SeoOffer & {
  slug: string;
  dates: {
    openDate: string | null;
    closeDate: string | null;
    allotmentDate: string | null;
    listingDate: string | null;
  };
};

/** Site graph. No ratings, reviews, or invented statistics. */
export function websiteDocument(origin: URL): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "IPO Singh",
    url: new URL("/", origin).href,
    description: "All IPO insights. One place.",
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin.origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function webPageDocument(origin: URL, page: { name: string; path: string; description: string }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.name,
    description: page.description,
    url: new URL(page.path, origin).href,
    inLanguage: "en-IN",
    isPartOf: { "@type": "WebSite", name: "IPO Singh", url: new URL("/", origin).href },
  };
}

/** Visible IPO links only. An empty list produces no markup. */
export function collectionDocument(
  origin: URL,
  page: { name: string; path: string; description: string; items: readonly LinkedItem[] },
): Record<string, unknown> | null {
  if (page.items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: new URL(page.path, origin).href,
    inLanguage: "en-IN",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: page.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: new URL(item.path, origin).href,
      })),
    },
  };
}

/** Stored identity, dates, and rupee prices. GMP and subscription are left out. */
export function ipoPageDocument(origin: URL, ipo: SeoIpo): Record<string, unknown> {
  const url = new URL(`/ipos/${ipo.slug}`, origin).href;
  const properties = storedProperties(ipo);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${ipo.companyName} IPO`,
    description: detailDescription(ipo),
    url,
    inLanguage: "en-IN",
    isPartOf: { "@type": "WebSite", name: "IPO Singh", url: new URL("/", origin).href },
    about: { "@type": "Organization", name: ipo.companyName },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: new URL("/", origin).href },
        {
          "@type": "ListItem",
          position: 2,
          name: boardBrowseTitle(ipo.board),
          item: new URL(`/ipos/${ipo.board}`, origin).href,
        },
        { "@type": "ListItem", position: 3, name: ipo.companyName, item: url },
      ],
    },
    ...(properties.length > 0 ? { additionalProperty: properties } : {}),
  };
}

export function homeDocument(origin: URL, items: readonly LinkedItem[]): Record<string, unknown> {
  const website = websiteDocument(origin);
  const collection = collectionDocument(origin, {
    name: "IPO Singh",
    path: "/",
    description: "All IPO insights. One place.",
    items,
  });
  if (!collection) return website;
  return {
    "@context": "https://schema.org",
    "@graph": [stripContext(website), stripContext(collection)],
  };
}

function storedProperties(ipo: SeoIpo): PropertyValue[] {
  const properties: PropertyValue[] = [
    { "@type": "PropertyValue", name: "Board", value: boardLabel(ipo.board) },
  ];
  if (ipo.status) properties.push({ "@type": "PropertyValue", name: "Status", value: statusLabel(ipo.status) });
  pushDate(properties, "Opening date", ipo.dates.openDate);
  pushDate(properties, "Closing date", ipo.dates.closeDate);
  pushDate(properties, "Allotment date", ipo.dates.allotmentDate);
  pushDate(properties, "Listing date", ipo.dates.listingDate);
  const low = ipo.offer.priceBand.lowRupees;
  const high = ipo.offer.priceBand.highRupees;
  if (low !== null) properties.push({ "@type": "PropertyValue", name: "Price band low", value: low, unitText: "INR" });
  if (high !== null) properties.push({ "@type": "PropertyValue", name: "Price band high", value: high, unitText: "INR" });
  if (low === null && high === null && ipo.offer.issuePriceRupees !== null) {
    properties.push({ "@type": "PropertyValue", name: "Issue price", value: ipo.offer.issuePriceRupees, unitText: "INR" });
  }
  return properties;
}

function pushDate(properties: PropertyValue[], name: string, value: string | null): void {
  if (value) properties.push({ "@type": "PropertyValue", name, value });
}

function stripContext(document: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...document };
  delete rest["@context"];
  return rest;
}
