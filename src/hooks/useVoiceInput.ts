import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { createVad, stepVad, type VadState } from './vad';

export type MicStart = 'ok' | 'denied' | 'error';

/** A finished recording: 16-bit mono PCM, base64-encoded for the API. */
export type Recording = { audio: string; sampleRate: number; seconds: number; heardSpeech: boolean };

/** How many recent loudness values the waveform shows. */
export const WAVE_BARS = 48;

// The orb's level: speech at arm's length sits roughly between these (dBFS).
const QUIET_DB = -52;
const LOUD_DB = -14;


/**
 * Records the microphone while started: drives the orb's `level` (0..1) and
 * keeps the audio for local speech recognition. Stops by itself when the
 * question has ended (see vad.ts), after 8 s without speech, or after 30 s.
 *
 * Nothing is written to disk; the audio stays in memory until it is sent to
 * the local Whisper service (server/, stt/) and is then dropped.
 */
export function useVoiceInput(level: SharedValue<number>, onAutoStop: () => void) {
  const active = useSharedValue(false);
  /** Recent loudness values (0..1), newest last, for the waveform. */
  const history = useSharedValue<number[]>([]);
  const state = useRef({ chunks: [] as Float32Array[], rate: 16000, vad: createVad() as VadState });
  const autoStop = useRef(onAutoStop);
  useEffect(() => {
    autoStop.current = onAutoStop;
  }, [onAutoStop]);

  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'float32',
    onBuffer: (buffer) => {
      if (!active.get()) return;
      const samples = new Float32Array(buffer.data).slice();
      if (samples.length === 0) return;
      const s = state.current;
      s.chunks.push(samples);
      s.rate = buffer.sampleRate;

      let sum = 0;
      for (let i = 0; i < samples.length; i += 2) sum += samples[i] * samples[i];
      const db = 20 * Math.log10(Math.sqrt(sum / Math.ceil(samples.length / 2)) + 1e-7);
      const loudness = Math.min(1, Math.max(0, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)));
      level.set(withTiming(loudness, { duration: 90 }));
      history.set([...history.get().slice(1 - WAVE_BARS), loudness]);

      if (stepVad(s.vad, db, samples.length / buffer.sampleRate)) {
        active.set(false);
        autoStop.current();
      }
    },
  });

  const start = useCallback(async (): Promise<MicStart> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return 'denied';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      state.current = { chunks: [], rate: 16000, vad: createVad() };
      history.set([]);
      active.set(true);
      await stream.start();
      return 'ok';
    } catch {
      active.set(false);
      return 'error';
    }
  }, [stream, active, history]);

  /** Stops recording and returns what was heard (null if nothing was recorded). */
  const stop = useCallback((): Recording | null => {
    active.set(false);
    try {
      stream.stop();
    } catch {
      // The stream may already be torn down; there is nothing left to stop.
    }
    level.set(withTiming(0, { duration: 250 }));
    const s = state.current;
    state.current = { chunks: [], rate: 16000, vad: createVad() };
    if (s.chunks.length === 0) return null;
    return { audio: toBase64Pcm16(s.chunks), sampleRate: s.rate, seconds: s.vad.seconds, heardSpeech: s.vad.heard };
  }, [stream, level, active]);

  return { start, stop, history };
}

function toBase64Pcm16(chunks: Float32Array[]): string {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const pcm = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const v = Math.max(-1, Math.min(1, chunk[i]));
      pcm[offset++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  // Small slices: Hermes limits how many arguments one call may take.
  for (let i = 0; i < bytes.length; i += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  }
  return btoa(binary);
}
