import { redirect } from "next/navigation";

type Params = Promise<{ slug: string }>;

export default async function BlogArticleRedirect({ params }: { params: Params }) {
  const { slug } = await params;
  redirect(`/news/${slug}`);
}
