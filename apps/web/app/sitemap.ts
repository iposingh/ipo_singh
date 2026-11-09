import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { loadSitemapIssues } from "@/features/ipos/catalog";
import { siteUrl } from "@/lib/seo/site";
import { sitemapEntries } from "@/lib/seo/sitemap-entries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = siteUrl();
  if (!origin) return [];
  const loaded = await loadSitemapIssues();
  const issues = loaded.status === "ready" ? loaded.issues : [];
  return await sitemapEntries(origin, issues);
}
