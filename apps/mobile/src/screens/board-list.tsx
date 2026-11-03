import { useState } from "react";
import type { Board } from "@ipo-singh/contracts";
import { ListingList } from "../components/listing-list";
import { useBoardListings } from "./use-board-listings";

function BoardListBody({
  board,
  onBoardChange,
}: {
  board: Board;
  onBoardChange?: (board: Board) => void;
}) {
  const list = useBoardListings(board);
  return (
    <ListingList
      board={board}
      sections={list.sections}
      refreshing={list.refreshing}
      notice={list.notice}
      onRefresh={list.reload}
      onLoadMore={list.loadMore}
      onBoardChange={onBoardChange}
    />
  );
}

export function BoardListScreen({
  board: initialBoard,
  allowBoardSwitch = false,
}: {
  board: Board;
  /** Home dashboard can switch Mainboard / SME without leaving the tab. */
  allowBoardSwitch?: boolean;
}) {
  const [board, setBoard] = useState<Board>(initialBoard);
  const activeBoard = allowBoardSwitch ? board : initialBoard;
  return (
    <BoardListBody
      key={activeBoard}
      board={activeBoard}
      onBoardChange={allowBoardSwitch ? setBoard : undefined}
    />
  );
}
