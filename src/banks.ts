import AsyncStorage from '@react-native-async-storage/async-storage';

/** The other bank each customer connected (PSD2, read-only), by bank id. Kept on the device only. */
const KEY = 'banks.v2';

export async function loadConnected(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function saveConnected(connected: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(connected));
  } catch {
    // The connection still holds for this session.
  }
}
