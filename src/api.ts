import Constants from 'expo-constants';

import type { AskRequest, AskResponse, Summary, ToolCall, Viz } from './shared/api';

const PORT = 8787;

/**
 * The local API server (server/). It runs on the same computer as the Expo dev
 * server, so its address is taken from where the app was loaded from; set
 * EXPO_PUBLIC_API_URL to point somewhere else.
 */
function baseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:${PORT}`;
}

export class AskError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function ask(request: AskRequest, signal: AbortSignal): Promise<{ text: string; viz?: Viz; call?: ToolCall; sources?: string[] }> {
  const response = await fetch(`${baseUrl()}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': process.env.EXPO_PUBLIC_API_TOKEN ?? '' },
    body: JSON.stringify(request),
    signal,
  });
  const body = (await response.json().catch(() => ({ error: 'Invalid response' }))) as AskResponse;
  if (!response.ok || 'error' in body) {
    throw new AskError('error' in body ? body.error : `HTTP ${response.status}`, response.status);
  }
  return body;
}

/** Sends recorded speech to the local Whisper service; returns the recognised text ('' if none). */
export async function transcribe(audio: string, sampleRate: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(`${baseUrl()}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': process.env.EXPO_PUBLIC_API_TOKEN ?? '' },
    body: JSON.stringify({ audio, sampleRate }),
    signal,
  });
  const body = (await response.json().catch(() => ({ error: 'Invalid response' }))) as { text?: string; error?: string };
  if (!response.ok || body.error) throw new AskError(body.error ?? `HTTP ${response.status}`, response.status);
  return (body.text ?? '').trim();
}

/** Whether the server can read answers aloud (Kokoro on the Mac; checked once). */
let voiceCheck: Promise<boolean> | null = null;
export function serverHasVoice(): Promise<boolean> {
  voiceCheck ??= fetch(`${baseUrl()}/health`)
    .then((r) => r.json() as Promise<{ voice?: boolean }>)
    .then((h) => h.voice === true)
    .catch(() => {
      voiceCheck = null; // try again next time
      return false;
    });
  return voiceCheck;
}

/** A URL the audio player can stream the spoken answer from. */
/** Diagnostics from the web version (what happened to the voice) for the server log. */
export function clientLog(data: Record<string, unknown>): void {
  void fetch(`${baseUrl()}/clientlog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': process.env.EXPO_PUBLIC_API_TOKEN ?? '' },
    body: JSON.stringify(data),
  }).catch(() => {});
}

export function speechUrl(text: string): string {
  return `${baseUrl()}/speak?token=${encodeURIComponent(process.env.EXPO_PUBLIC_API_TOKEN ?? '')}&text=${encodeURIComponent(text)}`;
}

/** The start screen's overview (computed on the server, no model involved). */
export async function getSummary(personaId: string, banks: string[], signal: AbortSignal): Promise<Summary> {
  const response = await fetch(`${baseUrl()}/summary?personaId=${encodeURIComponent(personaId)}${banks.length ? `&banks=${banks.map(encodeURIComponent).join(',')}` : ''}`, {
    headers: { 'X-App-Token': process.env.EXPO_PUBLIC_API_TOKEN ?? '' },
    signal,
  });
  if (!response.ok) throw new AskError(`HTTP ${response.status}`, response.status);
  return (await response.json()) as Summary;
}
