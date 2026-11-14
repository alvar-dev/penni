import AsyncStorage from '@react-native-async-storage/async-storage';

/** Customers who connected another bank (PSD2, read-only), with when. Kept on the device only. */
const KEY = 'banks.v1';

export async function loadConnected(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export async function saveConnected(connected: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(connected));
  } catch {
    // The connection still holds for this session.
  }
}
