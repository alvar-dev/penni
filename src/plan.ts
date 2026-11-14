import AsyncStorage from '@react-native-async-storage/async-storage';

/** A surprise-fund plan the customer switched on. Kept on the device only. */
export type Plan = { monthly: number; startedAt: number };

const KEY = 'plans.v1';

export async function loadPlans(): Promise<Record<string, Plan>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Plan>) : {};
  } catch {
    return {};
  }
}

export async function savePlans(plans: Record<string, Plan>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    // The plan still shows for this session.
  }
}
