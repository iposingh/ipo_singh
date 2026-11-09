import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { formatIstDate } from "@ipo-singh/core";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { blogCategoryLabel, blogDisclaimer } from "@/features/blog/schema";
import { listPublishedArticles } from "@/features/blog/load";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "News",
  description: "IPO Singh news and educational updates. No invented financial news.",
  path: "/news",
});

function coverSrc(url: string): string {
  if (url.startsWith("/api/v1/articles/") && url.endsWith("/cover")) {
    const slug = url.slice("/api/v1/articles/".length, -"/cover".length);
    return `/api/articles/${slug}/cover`;
  }
  return url;
}

export default async function NewsIndexPage() {
  const articles = await listPublishedArticles();
  return (
    <PageContainer className="grid gap-8">
      <PageHeader title="News" description="Published updates from IPO Singh. Drafts stay private until an administrator publishes them." />
      {articles.length === 0 ? (
        <p className="text-sm text-muted">No published articles yet. IPO Singh does not invent market news.</p>
      ) : (
        <ul className="grid gap-4">
          {articles.map((article) => (
            <li key={article.id} className="rounded-panel border border-border bg-surface p-4">
              {article.cover ? (
                <div className="relative mb-3 aspect-[16/9] w-full overflow-hidden rounded-control bg-surface-muted">
                  <Image
                    src={coverSrc(article.cover.url)}
                    alt={article.cover.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 720px"
                    unoptimized
                  />
                </div>
              ) : null}
              <p className="text-xs font-medium text-muted">{blogCategoryLabel[article.category]}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={`/news/${article.slug}`} prefetch={false} className="underline-offset-2 hover:underline">
                  {article.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{article.summary}</p>
              <p className="mt-2 text-xs text-muted">
                {formatIstDate(article.publishedAt.slice(0, 10))}
                {` · Source ${article.sourceName}`}
              </p>
              <Link href={`/news/${article.slug}`} prefetch={false} className="mt-3 inline-flex text-sm font-medium underline-offset-2 hover:underline">
                Read more
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm leading-6 text-muted">{blogDisclaimer}</p>
    </PageContainer>
  );
}
