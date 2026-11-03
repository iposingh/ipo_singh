import { BoardListScreen } from "../../src/screens/board-list";

export default function HomeRoute() {
  return <BoardListScreen board="mainboard" allowBoardSwitch />;
}
