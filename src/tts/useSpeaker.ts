import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { serverHasVoice, speechUrl } from '../api';
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
 * phone when it is ready, else Kokoro on the computer (Expo Go, local server),
 * else the phone's own voice.
 */
export function useSpeaker() {
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const kokoro = useRef<KokoroApi | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);

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
    const p = player.current;
    player.current = null;
    if (p) {
      try {
        p.pause();
        p.remove();
      } catch {
        // Already released.
      }
    }
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
      // Kokoro on the computer, streamed from the local server (Expo Go).
      const serverVoice = async () => {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
        if (current.current !== id) return;
        const p = createAudioPlayer({ uri: speechUrl(words) });
        player.current = p;
        let started = false;
        p.addListener('playbackStatusUpdate', (status) => {
          if (status.isLoaded && !started) {
            started = true;
            p.play();
          }
          if (status.didJustFinish && player.current === p) {
            player.current = null;
            p.remove();
            finish(id);
          }
        });
        p.play();
      };
      const engine = kokoro.current;
      if (!engine) {
        void serverHasVoice().then((voice) => {
          if (current.current !== id) return;
          if (voice) void serverVoice().catch(deviceVoice);
          else deviceVoice();
        });
        return;
      }
      engine
        .speak(words)
        .then((seconds) => {
          done.current = setTimeout(() => finish(id), seconds * 1000 + 150);
        })
        // If Kokoro fails, this answer is read with the phone's own voice.
        .catch(() => current.current === id && deviceVoice());
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
