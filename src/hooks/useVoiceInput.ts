import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { canRecognizeOnDevice, deviceSpeech, SPEECH_LANG } from './deviceSpeech';
import { createVad, stepVad, type VadState } from './vad';

export type MicStart = 'ok' | 'denied' | 'error';

/**
 * A finished recording: 16-bit mono PCM, base64-encoded for the API; or, when
 * the phone's own recognizer did the work, just the recognised `text`.
 */
export type Recording = { audio: string; sampleRate: number; seconds: number; heardSpeech: boolean; text?: string };

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
 *
 * In the installed app the phone's own recognizer is used instead (see
 * deviceSpeech.ts): it listens, ends on a pause by itself and returns text,
 * and its volume drives the orb and the waveform.
 */
/** The question has ended after this long without new words (phone's recognizer). */
const QUESTION_PAUSE_MS = 1800;
/** Nothing heard at all: stop listening. */
const NO_SPEECH_MS = 8000;

export function useVoiceInput(level: SharedValue<number>, onAutoStop: () => void) {
  const active = useSharedValue(false);
  /** Recent loudness values (0..1), newest last, for the waveform. */
  const history = useSharedValue<number[]>([]);
  const state = useRef({ chunks: [] as Float32Array[], rate: 16000, vad: createVad() as VadState });
  const autoStop = useRef(onAutoStop);
  useEffect(() => {
    autoStop.current = onAutoStop;
  }, [onAutoStop]);

  // The phone's recognizer: the latest transcript, and whether it has ended.
  const speech = useRef({ transcript: '', finals: [] as string[], ended: true, startedAt: 0, waiters: [] as (() => void)[], limit: undefined as ReturnType<typeof setTimeout> | undefined, quiet: undefined as ReturnType<typeof setTimeout> | undefined });
  useEffect(() => {
    if (!deviceSpeech) return;
    const subscriptions = [
      deviceSpeech.addListener('result', (event) => {
        const s = speech.current;
        const text = event.results[0]?.transcript?.trim();
        if (text) {
          // Some recognizers send each finished segment on its own (Android), others the
          // whole question so far (iOS): keep the finished ones and the one in progress.
          if (event.isFinal) s.finals.push(text);
          s.transcript = (event.isFinal ? s.finals : [...s.finals, text]).join(' ');
        }
        // The question is over after a real pause, not at the recognizer's first final result.
        clearTimeout(s.quiet);
        s.quiet = setTimeout(() => deviceSpeech?.stop(), QUESTION_PAUSE_MS);
      }),
      deviceSpeech.addListener('volumechange', (event) => {
        if (!active.get()) return;
        // -2..10, below 0 inaudible.
        const loudness = Math.min(1, Math.max(0, event.value / 10));
        level.set(withTiming(loudness, { duration: 90 }));
        history.set([...history.get().slice(1 - WAVE_BARS), loudness]);
      }),
      deviceSpeech.addListener('error', (event) => {
        if (__DEV__) console.warn('speech recognition', event.error, event.message);
      }),
      // Also after an error. A pause ends the question here, like the VAD does below.
      deviceSpeech.addListener('end', () => {
        const s = speech.current;
        s.ended = true;
        clearTimeout(s.limit);
        clearTimeout(s.quiet);
        s.waiters.splice(0).forEach((resolve) => resolve());
        if (active.get()) {
          active.set(false);
          autoStop.current();
        }
      }),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, [active, level, history]);

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
    if (deviceSpeech) {
      try {
        const permission = await deviceSpeech.requestPermissionsAsync();
        if (!permission.granted) return 'denied';
        const local = await canRecognizeOnDevice();
        speech.current = { transcript: '', finals: [], ended: false, startedAt: Date.now(), waiters: [], limit: undefined, quiet: undefined };
        history.set([]);
        active.set(true);
        deviceSpeech.start({
          lang: SPEECH_LANG,
          interimResults: true,
          // We decide when the question has ended (a pause of QUESTION_PAUSE_MS); left to
          // itself the recognizer stopped at its first final result, often mid-sentence.
          continuous: true,
          requiresOnDeviceRecognition: local,
          addsPunctuation: local,
          volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
          // Older Android versions ignore continuous: give their endpointer longer pauses.
          androidIntentOptions: {
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1800,
          },
        });
        // A question is never longer than this; and if nothing is heard, give up.
        speech.current.limit = setTimeout(() => deviceSpeech?.stop(), 30_000);
        speech.current.quiet = setTimeout(() => deviceSpeech?.stop(), NO_SPEECH_MS);
        return 'ok';
      } catch {
        active.set(false);
        speech.current.ended = true;
        return 'error';
      }
    }
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
  const stop = useCallback(async (): Promise<Recording | null> => {
    if (deviceSpeech) {
      active.set(false);
      level.set(withTiming(0, { duration: 250 }));
      const s = speech.current;
      if (!s.ended) {
        // Let the recognizer finish the last words (it ends with a final result).
        await new Promise<void>((resolve) => {
          s.waiters.push(resolve);
          deviceSpeech?.stop();
          setTimeout(resolve, 1500);
        });
      }
      if (!s.startedAt) return null;
      const text = s.transcript.trim();
      const seconds = (Date.now() - s.startedAt) / 1000;
      speech.current = { transcript: '', finals: [], ended: true, startedAt: 0, waiters: [], limit: undefined, quiet: undefined };
      return { audio: '', sampleRate: 0, seconds, heardSpeech: text.length > 0, text };
    }
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
