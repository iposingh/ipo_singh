import { Redirect } from "expo-router";

/** Legacy stack search route. IPOs tab owns listings and search. */
export default function SearchRedirect() {
  return <Redirect href="/(tabs)/ipos" />;
}
