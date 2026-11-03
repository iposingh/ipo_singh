import type { Metadata } from "next";

const shareImage = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "IPO Singh. All IPO insights. One place.",
};

type PageTitle = string | { absolute: string };

/** Title, description, canonical, and share cards for one public path. */
export function pageMetadata(input: {
  title: PageTitle;
  description: string;
  path: string;
  /** Set null when this address should not point Google at another page. */
  canonical?: string | null;
  index?: boolean;
  follow?: boolean;
}): Metadata {
  const index = input.index !== false;
  const follow = input.follow !== false;
  const socialTitle = typeof input.title === "string" ? `${input.title} | IPO Singh` : input.title.absolute;
  const canonical = input.canonical === undefined ? input.path : input.canonical;
  return {
    title: input.title,
    description: input.description,
    ...(canonical ? { alternates: { canonical } } : {}),
    robots: { index, follow },
    openGraph: {
      title: socialTitle,
      description: input.description,
      ...(canonical ? { url: canonical } : {}),
      siteName: "IPO Singh",
      type: "website",
      locale: "en_IN",
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: input.description,
      images: [shareImage],
    },
  };
}
