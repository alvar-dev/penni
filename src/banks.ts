import AsyncStorage from '@react-native-async-storage/async-storage';

/** The other banks each customer connected (PSD2, read-only), by bank id. Kept on the device only. */
const KEY = 'banks.v3';
const OLD_KEY = 'banks.v2';

export async function loadConnected(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, string[]>;
    // One bank per customer before; carry it over.
    const old = await AsyncStorage.getItem(OLD_KEY);
    return old ? Object.fromEntries(Object.entries(JSON.parse(old) as Record<string, string>).map(([k, v]) => [k, [v]])) : {};
  } catch {
    return {};
  }
}

export async function saveConnected(connected: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(connected));
  } catch {
    // The connections still hold for this session.
  }
}
