import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatIstDate } from "@ipo-singh/core";
import { PageContainer } from "@/components/layout/page-container";
import { blogCategoryLabel } from "@/features/blog/schema";
import { findPublishedArticle, listPublishedArticles } from "@/features/blog/load";
import { pageMetadata } from "@/lib/seo/metadata";

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  return listPublishedArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const article = findPublishedArticle(slug);
  if (!article) {
    return pageMetadata({
      title: "Article not found",
      description: "That educational article is not published on IPO Singh.",
      path: "/blog",
      canonical: null,
      index: false,
      follow: false,
    });
  }
  return pageMetadata({
    title: article.title,
    description: article.summary,
    path: `/blog/${article.slug}`,
  });
}

export default async function BlogArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = findPublishedArticle(slug);
  if (!article) notFound();
  return (
    <PageContainer className="grid gap-6">
      <p className="text-sm text-muted">
        <Link href="/blog" className="underline">
          Blog
        </Link>
        {" / "}
        {blogCategoryLabel[article.category]}
      </p>
      <article className="grid max-w-3xl gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{article.title}</h1>
        <p className="text-sm text-muted">
          {article.authorName}
          {article.publishedAt ? ` · ${formatIstDate(article.publishedAt.slice(0, 10))}` : ""}
          {article.evergreen ? " · Educational evergreen" : ""}
        </p>
        <p className="text-base leading-7 text-foreground">{article.summary}</p>
        <div className="grid gap-3 text-base leading-7 text-foreground">
          {article.bodyMarkdown.split(/\n\n+/).map((paragraph) => (
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
        {article.relatedIpoSlugs.length > 0 ? (
          <section className="grid gap-2 border-t border-border pt-4">
            <h2 className="text-sm font-semibold">Related IPOs</h2>
            <ul className="grid gap-1 text-sm">
              {article.relatedIpoSlugs.map((ipoSlug) => (
                <li key={ipoSlug}>
                  <Link href={`/ipos/${ipoSlug}`} className="underline">
                    {ipoSlug}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.summary,
            datePublished: article.publishedAt,
            dateModified: article.updatedAt,
            author: { "@type": "Person", name: article.authorName },
          }),
        }}
      />
    </PageContainer>
  );
}
