import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Message } from './content';

/** A saved conversation. Kept on the device only. */
export type Conversation = {
  id: string;
  personaId: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

const KEY = 'conversations.v1';
const MAX_SAVED = 50;

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(parsed) ? parsed.filter((c) => c && c.id && Array.isArray(c.messages)) : [];
  } catch {
    return [];
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  try {
    const newest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED);
    await AsyncStorage.setItem(KEY, JSON.stringify(newest));
  } catch {
    // Saving history is a convenience; the conversation itself still works.
  }
}

/** A short title from the first question. */
export function titleFrom(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

/** Groups newest first under day headings. */
export function groupByDay(conversations: Conversation[], now = Date.now()): { title: string; items: Conversation[] }[] {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(now);
  const day = 86_400_000;
  const groups: { title: string; items: Conversation[] }[] = [
    { title: 'Today', items: [] },
    { title: 'Yesterday', items: [] },
    { title: 'Previous 7 days', items: [] },
    { title: 'Earlier', items: [] },
  ];
  for (const c of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const at = startOfDay(c.updatedAt);
    const index = at >= today ? 0 : at >= today - day ? 1 : at >= today - 7 * day ? 2 : 3;
    groups[index].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 15:46 for today, otherwise Nov 12. */
export function shortTime(t: number, now = Date.now()): string {
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
