import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { blogCategoryLabel, blogDisclaimer } from "@/features/blog/schema";
import { listPublishedArticles } from "@/features/blog/load";
import { formatIstDate } from "@ipo-singh/core";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "IPO Insights Blog",
  description: "Educational IPO guides from IPO Singh. No invented financial news.",
  path: "/blog",
});

export default function BlogIndexPage() {
  const articles = listPublishedArticles();
  return (
    <PageContainer className="grid gap-8">
      <PageHeader title="IPO Insights" description="Educational guides. News articles are published only after editorial review." />
      {articles.length === 0 ? (
        <p className="text-sm text-muted">No published articles yet. IPO Singh does not invent market news.</p>
      ) : (
        <ul className="grid gap-4">
          {articles.map((article) => (
            <li key={article.id} className="rounded-panel border border-border bg-surface p-4">
              <p className="text-xs font-medium text-muted">{blogCategoryLabel[article.category]}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={`/blog/${article.slug}`} className="underline-offset-2 hover:underline">
                  {article.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{article.summary}</p>
              <p className="mt-2 text-xs text-muted">
                {article.authorName}
                {article.publishedAt ? ` · ${formatIstDate(article.publishedAt.slice(0, 10))}` : ""}
                {` · Source ${article.sourceName}`}
                {article.evergreen ? " · Educational" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm leading-6 text-muted">{blogDisclaimer}</p>
    </PageContainer>
  );
}
