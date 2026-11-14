import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EN } from '../lang';
import type { KokoroApi } from './KokoroEngine';
import { speakable } from './speakable';

/**
 * The on-device Kokoro voice exists only in the installed app; in Expo Go the
 * native libraries are missing, so the module is not even loaded there.
 */
export const KokoroEngine: typeof import('./KokoroEngine').KokoroEngine | null = (() => {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // A lazy require, so Expo Go never evaluates the native-backed module; if the
    // native libraries fail to load, the phone's own voice is used instead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./KokoroEngine').KokoroEngine;
  } catch {
    return null;
  }
})();

const KEY = 'voice.v1';

/**
 * Reads answers aloud. The text is always shown; the voice can be muted (kept
 * on the device) and any answer can be played on demand. Uses Kokoro on the
 * phone when it is ready, otherwise the phone's own voice.
 */
export function useSpeaker() {
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const kokoro = useRef<KokoroApi | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v === 'off' && setVoiceOn(false))
      .catch(() => {});
  }, []);

  const finish = useCallback((id: string) => {
    if (current.current !== id) return;
    current.current = null;
    setSpeakingId(null);
  }, []);

  const stop = useCallback(() => {
    clearTimeout(done.current);
    current.current = null;
    setSpeakingId(null);
    kokoro.current?.stop();
    void Speech.stop();
  }, []);

  const speak = useCallback(
    (id: string, text: string) => {
      stop();
      const words = speakable(text);
      if (!words) return;
      current.current = id;
      setSpeakingId(id);
      const deviceVoice = () =>
        Speech.speak(words, { language: EN ? 'en-US' : 'fi-FI', onDone: () => finish(id), onStopped: () => finish(id), onError: () => finish(id) });
      const engine = kokoro.current;
      if (engine) {
        engine
          .speak(words)
          .then((seconds) => {
            done.current = setTimeout(() => finish(id), seconds * 1000 + 150);
          })
          // If Kokoro fails, this answer is read with the phone's own voice.
          .catch(() => current.current === id && deviceVoice());
        return;
      }
      deviceVoice();
    },
    [stop, finish],
  );

  const toggleVoice = useCallback(() => {
    setVoiceOn((on) => {
      const next = !on;
      if (!next) stop();
      AsyncStorage.setItem(KEY, next ? 'on' : 'off').catch(() => {});
      return next;
    });
  }, [stop]);

  const onKokoro = useCallback((api: KokoroApi | null) => {
    kokoro.current = api;
  }, []);

  // A stable object, so callers' callbacks only change when the voice state does.
  return useMemo(() => ({ voiceOn, toggleVoice, speak, stop, speakingId, onKokoro }), [voiceOn, toggleVoice, speak, stop, speakingId, onKokoro]);
}
