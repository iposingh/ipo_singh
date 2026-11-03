import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { privateRobotsPaths, siteUrl } from "@/lib/seo/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...privateRobotsPaths, "/*?"],
    },
    ...(origin ? { sitemap: new URL("/sitemap.xml", origin).href, host: origin.origin } : {}),
  };
}
