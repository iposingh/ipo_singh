import type { Board } from "@ipo-singh/contracts";
import { ListingList } from "../components/listing-list";
import { useBoardListings } from "./use-board-listings";

/** Fixed-board IPO browser (Mainboard or SME). Browse mode lives inside the list. */
export function BoardListScreen({ board }: { board: Board }) {
  const list = useBoardListings(board);
  return (
    <ListingList
      board={board}
      sections={list.sections}
      refreshing={list.refreshing}
      notice={list.notice}
      onRefresh={list.reload}
      onLoadMore={list.loadMore}
    />
  );
}
