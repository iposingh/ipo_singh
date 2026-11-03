import * as SecureStore from "expo-secure-store";
import { assertSecretKey, type SecretStore } from "./secrets";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function deviceSecretStore(): SecretStore {
  return {
    async get(key) {
      assertSecretKey(key);
      return SecureStore.getItemAsync(key, options);
    },
    async set(key, value) {
      assertSecretKey(key);
      await SecureStore.setItemAsync(key, value, options);
    },
    async delete(key) {
      assertSecretKey(key);
      await SecureStore.deleteItemAsync(key, options);
    },
  };
}
