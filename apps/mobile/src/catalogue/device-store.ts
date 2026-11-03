import AsyncStorage from "@react-native-async-storage/async-storage";
import type { JsonCache } from "./response-cache";

export function deviceJsonCache(): JsonCache {
  return {
    read(key) {
      return AsyncStorage.getItem(key);
    },
    write(key, value) {
      return AsyncStorage.setItem(key, value);
    },
    remove(key) {
      return AsyncStorage.removeItem(key);
    },
  };
}
