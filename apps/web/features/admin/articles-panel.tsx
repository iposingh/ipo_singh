"use client";

import Link from "next/link";
import { useState } from "react";
import { articleCategoryLabel, type ArticleCategory } from "@ipo-singh/contracts";
import { IstDateTime } from "@/components/financial/ist-date-time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminResource, recordObject } from "@/features/admin/admin-resource";
import { readCsrfToken } from "@/features/auth/csrf";

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

function rowsFrom(payload: unknown): ArticleRow[] | null {
  const body = recordObject(payload);
  if (!body || !Array.isArray(body.articles)) return null;
  const rows: ArticleRow[] = [];
  for (const item of body.articles) {
    const row = recordObject(item);
    if (!row || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.status !== "string") continue;
    rows.push({
      id: row.id,
      slug: typeof row.slug === "string" ? row.slug : row.id,
      title: row.title,
      category: typeof row.category === "string" ? row.category : "general",
      status: row.status,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
      publishedAt: typeof row.publishedAt === "string" ? row.publishedAt : null,
    });
  }
  return rows;
}

function categoryLabel(value: string): string {
  return articleCategoryLabel[value as ArticleCategory] ?? value;
}

async function adminPost(path: string, method: string): Promise<{ ok: boolean; message: string }> {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(path, { method, headers, body: method === "DELETE" ? undefined : "{}" });
  if (response.status === 204) return { ok: true, message: "Deleted." };
  const text = await response.text();
  let message = "The request was refused.";
  try {
    const payload = JSON.parse(text) as { message?: string };
    if (payload.message) message = payload.message;
  } catch {
    // keep fallback
  }
  return { ok: response.ok, message: response.ok ? "Saved." : message };
}

export function ArticlesPanel() {
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">News Management</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Create, publish, and update IPO Singh news for the website and mobile app. Photo upload is optional.
            </p>
          </div>
          <Link
            href="/admin/articles/new"
            className="inline-flex h-11 items-center rounded-control bg-primary-solid px-4 text-sm font-medium text-primary-foreground"
          >
            Create News
          </Link>
        </div>
      </Card>
      <AdminResource path="/api/admin/articles" label="Loading news">
        {(payload) => <ArticleList payload={payload} />}
      </AdminResource>
    </div>
  );
}

function ArticleList({ payload }: { payload: unknown }) {
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<ArticleRow[] | null>(() => rowsFrom(payload));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!rows) return <EmptyState title="News is unavailable" description="The article list could not be read." />;
  if (rows.length === 0) return <EmptyState title="No news articles yet" description="Create a draft to get started." />;

  async function act(id: string, action: "publish" | "unpublish" | "delete") {
    if (action === "delete" && !window.confirm("Delete this article permanently?")) return;
    setPending(true);
    setMessage(null);
    const path =
      action === "delete" ? `/api/admin/articles/${id}` : `/api/admin/articles/${id}/${action === "publish" ? "publish" : "unpublish"}`;
    const result = await adminPost(path, action === "delete" ? "DELETE" : "POST");
    setPending(false);
    setMessage(result.message);
    if (!result.ok) return;
    if (action === "delete") setRows((current) => (current ? current.filter((row) => row.id !== id) : current));
    else setVersion((value) => value + 1);
  }

  return (
    <div key={version} className="grid gap-3">
      {rows.map((row) => (
        <Card key={row.id} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-foreground">{row.title}</p>
            <p className="text-xs text-muted">
              {categoryLabel(row.category)} · {row.status}
              {row.publishedAt ? (
                <>
                  {" "}
                  · Published <IstDateTime value={new Date(row.publishedAt)} />
                </>
              ) : null}
              {row.updatedAt ? (
                <>
                  {" "}
                  · Updated <IstDateTime value={new Date(row.updatedAt)} />
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/articles/${row.id}`} className="inline-flex h-10 items-center rounded-control border border-border px-3 text-sm">
              Edit
            </Link>
            <Link href={`/news/${row.slug}`} target="_blank" className="inline-flex h-10 items-center rounded-control border border-border px-3 text-sm">
              Preview
            </Link>
            {row.status !== "published" ? (
              <Button type="button" loading={pending} onClick={() => void act(row.id, "publish")}>
                Publish
              </Button>
            ) : (
              <Button type="button" variant="secondary" loading={pending} onClick={() => void act(row.id, "unpublish")}>
                Unpublish
              </Button>
            )}
            <Button type="button" variant="danger" loading={pending} onClick={() => void act(row.id, "delete")}>
              Delete
            </Button>
          </div>
        </Card>
      ))}
      {message ? <p className="text-sm text-muted" aria-live="polite">{message}</p> : null}
    </div>
  );
}
