import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatIstDate } from "@ipo-singh/core";
import { PageContainer } from "@/components/layout/page-container";
import { blogCategoryLabel, blogDisclaimer } from "@/features/blog/schema";
import { findPublishedArticle, listPublishedArticles } from "@/features/blog/load";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ slug: string }>;

function coverSrc(url: string): string {
  if (url.startsWith("/api/v1/articles/") && url.endsWith("/cover")) {
    const slug = url.slice("/api/v1/articles/".length, -"/cover".length);
    return `/api/articles/${slug}/cover`;
  }
  return url;
}

export async function generateStaticParams() {
  const articles = await listPublishedArticles();
  const params = articles.map((article) => ({ slug: article.slug }));
  // Cache Components require at least one static param at build time.
  return params.length > 0 ? params : [{ slug: "pending-publication" }];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const article = await findPublishedArticle(slug);
  if (!article) {
    return pageMetadata({
      title: "Article not found",
      description: "That news article is not published on IPO Singh.",
      path: "/news",
      canonical: null,
      index: false,
      follow: false,
    });
  }
  return pageMetadata({
    title: article.title,
    description: article.summary,
    path: `/news/${article.slug}`,
  });
}

export default async function NewsArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = await findPublishedArticle(slug);
  if (!article) notFound();
  return (
    <PageContainer className="grid gap-6">
      <p className="text-sm text-muted">
        <Link href="/news" className="underline">
          News
        </Link>
        {" / "}
        {blogCategoryLabel[article.category]}
      </p>
      <article className="grid max-w-3xl gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{article.title}</h1>
        <p className="text-sm text-muted">
          {blogCategoryLabel[article.category]} · {formatIstDate(article.publishedAt.slice(0, 10))}
          {` · Source ${article.sourceName}`}
        </p>
        {article.cover ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-control bg-surface-muted">
            <Image
              src={coverSrc(article.cover.url)}
              alt={article.cover.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 720px"
              unoptimized
              priority
            />
          </div>
        ) : null}
        <p className="text-base leading-7 text-foreground">{article.summary}</p>
        <div className="grid gap-3 text-base leading-7 text-foreground">
          {article.bodyMarkdown
            .replace(/<[^>]*>/g, "")
            .split(/\n\n+/)
            .map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
        </div>
        {article.citations.length > 0 ? (
          <section className="grid gap-2 border-t border-border pt-4">
            <h2 className="text-sm font-semibold">Sources</h2>
            <ul className="grid gap-1 text-sm">
              {article.citations.map((citation) => (
                <li key={citation.url}>
                  <a href={citation.url} className="text-link underline" rel="noopener noreferrer" target="_blank">
                    {citation.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-sm leading-6 text-muted">{blogDisclaimer}</p>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            headline: article.title,
            description: article.summary,
            datePublished: article.publishedAt,
            dateModified: article.updatedAt,
            author: { "@type": "Organization", name: article.authorName },
            ...(article.cover ? { image: [coverSrc(article.cover.url)] } : {}),
          }),
        }}
      />
    </PageContainer>
  );
}
