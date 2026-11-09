"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { articleCategories, articleCategoryLabel, type ArticleCategory } from "@ipo-singh/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { readCsrfToken } from "@/features/auth/csrf";

type ArticleRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: ArticleCategory;
  status: "draft" | "published" | "archived";
  authorName: string;
  sourceName: string;
  bodyMarkdown: string;
  relatedIpoSlugs: string[];
  citations: { label: string; url: string }[];
  evergreen: boolean;
  cover: { url: string; alt: string } | null;
  seoDescription: string | null;
  publishedAt: string | null;
};

async function adminSend(path: string, method: string, body?: BodyInit, contentType?: string): Promise<{ status: number; payload: unknown }> {
  const headers = new Headers({ accept: "application/json" });
  if (contentType) headers.set("content-type", contentType);
  else if (body) headers.set("content-type", "application/json");
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(path, { method, headers, body });
  const text = await response.text();
  if (!text) return { status: response.status, payload: null };
  try {
    return { status: response.status, payload: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, payload: null };
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

function recordFrom(payload: unknown): ArticleRecord | null {
  if (!payload || typeof payload !== "object" || !("id" in payload)) return null;
  const record = payload as Partial<ArticleRecord>;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.summary !== "string") return null;
  return {
    id: record.id,
    slug: typeof record.slug === "string" ? record.slug : record.id,
    title: record.title,
    summary: record.summary,
    category: (record.category as ArticleCategory) ?? "general",
    status: record.status === "published" || record.status === "archived" ? record.status : "draft",
    authorName: typeof record.authorName === "string" ? record.authorName : "IPO Singh Editorial",
    sourceName: typeof record.sourceName === "string" ? record.sourceName : "IPO Singh",
    bodyMarkdown: typeof record.bodyMarkdown === "string" ? record.bodyMarkdown : "",
    relatedIpoSlugs: Array.isArray(record.relatedIpoSlugs) ? record.relatedIpoSlugs.filter((item): item is string => typeof item === "string") : [],
    citations: Array.isArray(record.citations)
      ? record.citations.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as { label?: unknown; url?: unknown };
          if (typeof row.label !== "string" || typeof row.url !== "string") return [];
          return [{ label: row.label, url: row.url }];
        })
      : [],
    evergreen: record.evergreen === true,
    cover: record.cover && typeof record.cover === "object" && typeof record.cover.url === "string" && typeof record.cover.alt === "string"
      ? { url: record.cover.url, alt: record.cover.alt }
      : null,
    seoDescription: typeof record.seoDescription === "string" ? record.seoDescription : null,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : null,
  };
}

export function ArticleEditor({ articleId }: { articleId?: string }) {
  const router = useRouter();
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [category, setCategory] = useState<ArticleCategory>("ipo-updates");
  const [authorName, setAuthorName] = useState("IPO Singh Editorial");
  const [sourceName, setSourceName] = useState("IPO Singh");
  const [sourceUrl, setSourceUrl] = useState("");
  const [relatedIpo, setRelatedIpo] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    void adminSend(`/api/admin/articles/${articleId}`, "GET").then((result) => {
      const next = recordFrom(result.payload);
      if (!next) {
        setMessage("That article could not be loaded.");
        return;
      }
      setArticle(next);
      setTitle(next.title);
      setSummary(next.summary);
      setBodyMarkdown(next.bodyMarkdown);
      setCategory(next.category);
      setAuthorName(next.authorName);
      setSourceName(next.sourceName);
      setSourceUrl(next.citations[0]?.url ?? "");
      setRelatedIpo(next.relatedIpoSlugs[0] ?? "");
      setSeoDescription(next.seoDescription ?? "");
      setCoverPreview(next.cover?.url ?? null);
    });
  }, [articleId]);

  function body() {
    const citations =
      sourceUrl.trim().length > 0
        ? [{ label: sourceName.trim() || "Source", url: sourceUrl.trim() }]
        : [];
    return {
      title: title.trim(),
      summary: summary.trim(),
      category,
      authorName: authorName.trim() || "IPO Singh Editorial",
      sourceName: sourceName.trim() || "IPO Singh",
      bodyMarkdown: bodyMarkdown.trim(),
      relatedIpoSlugs: relatedIpo.trim() ? [relatedIpo.trim()] : [],
      citations,
      evergreen: false,
      cover: article?.cover ?? null,
      seoDescription: seoDescription.trim() || null,
      publishedAt: article?.publishedAt ?? null,
    };
  }

  async function save(event: FormEvent, publish: boolean) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setUploadError(null);
    const result = await adminSend(
      article ? `/api/admin/articles/${article.id}` : "/api/admin/articles",
      article ? "PATCH" : "POST",
      JSON.stringify(body()),
    );
    const saved = recordFrom(result.payload);
    if (!result.status.toString().startsWith("2") || !saved) {
      setPending(false);
      setMessage(messageFrom(result.payload, "That article could not be saved."));
      return;
    }
    setArticle(saved);
    if (coverFile) {
      setUploadProgress(true);
      const upload = await adminSend(`/api/admin/articles/${saved.id}/cover?alt=${encodeURIComponent(saved.title)}`, "POST", coverFile, coverFile.type);
      setUploadProgress(false);
      const withCover = recordFrom(upload.payload);
      if (!upload.status.toString().startsWith("2") || !withCover) {
        setPending(false);
        setUploadError(messageFrom(upload.payload, "The photo could not be uploaded. Text-only publishing still works."));
        if (!article) router.replace(`/admin/articles/${saved.id}`);
        return;
      }
      setArticle(withCover);
      setCoverPreview(withCover.cover?.url ?? null);
      setCoverFile(null);
    }
    if (publish && saved.status !== "published") {
      const published = await adminSend(`/api/admin/articles/${saved.id}/publish`, "POST", "{}");
      const live = recordFrom(published.payload);
      if (!published.status.toString().startsWith("2") || !live) {
        setPending(false);
        setMessage(messageFrom(published.payload, "The article was saved but could not be published."));
        if (!article) router.replace(`/admin/articles/${saved.id}`);
        return;
      }
      setArticle(live);
    }
    setPending(false);
    setMessage(publish ? "Article published successfully." : "Draft saved.");
    if (!article) router.replace(`/admin/articles/${saved.id}`);
  }

  async function removePhoto() {
    if (!article) return;
    setPending(true);
    setUploadError(null);
    const result = await adminSend(`/api/admin/articles/${article.id}/cover`, "DELETE");
    setPending(false);
    const next = recordFrom(result.payload);
    if (!result.status.toString().startsWith("2") || !next) {
      setUploadError(messageFrom(result.payload, "The photo could not be removed."));
      return;
    }
    setArticle(next);
    setCoverPreview(null);
    setCoverFile(null);
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void save(event, false)}>
      <Card className="grid gap-3">
        <h1 className="text-xl font-semibold text-foreground">{article ? "Edit news" : "Create news"}</h1>
        <Input id="news-title" label="Headline" value={title} required maxLength={160} onChange={(event) => setTitle(event.target.value)} />
        <label className="grid gap-1.5 text-sm font-medium text-foreground" htmlFor="news-summary">
          Short summary
          <textarea
            id="news-summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            required
            maxLength={400}
            className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 text-base font-normal text-foreground"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-foreground" htmlFor="news-body">
          Article body
          <textarea
            id="news-body"
            value={bodyMarkdown}
            onChange={(event) => setBodyMarkdown(event.target.value)}
            required
            className="min-h-48 rounded-control border border-border bg-surface px-3 py-2 font-mono text-sm font-normal text-foreground"
          />
        </label>
        <Select
          id="news-category"
          label="Category"
          value={category}
          onValueChange={(value) => setCategory(value as ArticleCategory)}
          options={articleCategories.map((item) => ({ value: item, label: articleCategoryLabel[item] }))}
        />
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-sm font-semibold text-foreground">Photo (optional)</h2>
        {coverPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={
              coverPreview.startsWith("/api/v1/articles/") && coverPreview.endsWith("/cover")
                ? `/api/articles/${coverPreview.slice("/api/v1/articles/".length, -"/cover".length)}/cover`
                : coverPreview
            }
            alt="Cover preview"
            className="max-h-56 w-full rounded-control object-cover"
          />
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          Upload photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setCoverFile(file);
              setUploadError(null);
              if (file) setCoverPreview(URL.createObjectURL(file));
            }}
          />
        </label>
        {uploadProgress ? <p className="text-sm text-muted">Uploading photo…</p> : null}
        {uploadError ? <p className="text-sm text-negative-text">{uploadError}</p> : null}
        <div className="flex flex-wrap gap-2">
          {coverPreview ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => void removePhoto()}>
              Remove photo
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="grid gap-3">
        <Input id="news-source-name" label="Source name" value={sourceName} maxLength={120} onChange={(event) => setSourceName(event.target.value)} />
        <Input id="news-source-url" label="Source URL" value={sourceUrl} type="url" placeholder="https://" onChange={(event) => setSourceUrl(event.target.value)} />
        <Input id="news-related-ipo" label="Related IPO slug" value={relatedIpo} placeholder="optional-ipo-slug" onChange={(event) => setRelatedIpo(event.target.value)} />
        <Input id="news-seo" label="SEO description" value={seoDescription} maxLength={300} onChange={(event) => setSeoDescription(event.target.value)} />
        <Input id="news-author" label="Author" value={authorName} maxLength={80} onChange={(event) => setAuthorName(event.target.value)} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {article ? "Update article" : "Save draft"}
        </Button>
        <Button type="button" variant="secondary" loading={pending} onClick={() => void save({ preventDefault() {} } as FormEvent, true)}>
          Publish now
        </Button>
        {article?.status === "published" ? (
          <Button
            type="button"
            variant="secondary"
            loading={pending}
            onClick={() => {
              void adminSend(`/api/admin/articles/${article.id}/unpublish`, "POST", "{}").then((result) => {
                const next = recordFrom(result.payload);
                if (next) setArticle(next);
                setMessage(result.status.toString().startsWith("2") ? "Unpublished." : messageFrom(result.payload, "Unpublish failed."));
              });
            }}
          >
            Unpublish
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-muted" aria-live="polite">{message}</p> : null}
    </form>
  );
}
