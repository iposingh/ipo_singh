import { ArticleEditor } from "@/features/admin/article-editor";

type Params = Promise<{ articleId: string }>;

export default async function AdminArticleEditPage({ params }: { params: Params }) {
  const { articleId } = await params;
  return <ArticleEditor articleId={articleId} />;
}
