import type { Metadata } from "next";
import { browseMetadata, IpoBrowsePage } from "@/features/ipos/ipo-browse";

type BrowseParams = Promise<{
  q?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
}>;

export async function generateMetadata({ searchParams }: { searchParams: BrowseParams }): Promise<Metadata> {
  return browseMetadata("sme", await searchParams);
}

export default function SmePage({ searchParams }: { searchParams: BrowseParams }) {
  return <IpoBrowsePage board="sme" searchParams={searchParams} />;
}
