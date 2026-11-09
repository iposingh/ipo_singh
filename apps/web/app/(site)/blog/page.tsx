import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "News",
  description: "IPO Singh news and educational updates.",
  path: "/news",
});

export default function BlogIndexRedirect() {
  redirect("/news");
}
