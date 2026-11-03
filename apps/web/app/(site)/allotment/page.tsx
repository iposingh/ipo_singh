import type { Metadata } from "next";
import { AllotmentBoard, type AllotmentBoardFilter } from "@/features/allotment/allotment-board";
import { allotmentIsIndexable } from "@/lib/seo/indexing";
import { pageMetadata } from "@/lib/seo/metadata";

type AllotmentParams = Promise<{ board?: string | string[] }>;

function boardFilter(params: { board?: string | string[] }): AllotmentBoardFilter {
  const raw = Array.isArray(params.board) ? params.board[0] : params.board;
  return raw === "mainboard" || raw === "sme" ? raw : "all";
}

export async function generateMetadata({ searchParams }: { searchParams: AllotmentParams }): Promise<Metadata> {
  const board = boardFilter(await searchParams);
  return pageMetadata({
    title: "Allotment",
    description: "IPO allotment is checked on the official registrar website. IPO Singh does not collect PAN or application numbers.",
    path: "/allotment",
    index: allotmentIsIndexable(board === "all" ? undefined : board),
  });
}

export default async function AllotmentPage({ searchParams }: { searchParams: AllotmentParams }) {
  const board = boardFilter(await searchParams);
  return <AllotmentBoard board={board} />;
}
