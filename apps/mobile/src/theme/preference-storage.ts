import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Non-sensitive device preferences (appearance, guest flags).
 * Authentication tokens must use expo-secure-store via auth/secure-store.ts instead.
 */
export async function readDevicePreference(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function writeDevicePreference(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function clearDevicePreference(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
