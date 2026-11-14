import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { serverHasVoice, speechUrl } from '../api';
import { EN } from '../lang';
import type { KokoroApi } from './KokoroEngine';
import { sentences } from '../shared/sentences';
import { speakable } from '../shared/speakable';

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
  /** The answer being read and the index of the sentence being read in it. */
  const [reading, setReading] = useState<{ id: string; sentence: number } | null>(null);
  const kokoro = useRef<KokoroApi | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<string | null>(null);
  /** Bumped on every stop, so a reading in progress notices and ends. */
  const turn = useRef(0);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v === 'off' && setVoiceOn(false))
      .catch(() => {});
  }, []);

  const finish = useCallback((id: string) => {
    if (current.current !== id) return;
    current.current = null;
    setReading(null);
  }, []);

  const stop = useCallback(() => {
    turn.current++;
    clearTimeout(done.current);
    current.current = null;
    setReading(null);
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
    (id: string, text: string, onStart?: () => void) => {
      stop();
      const parts = sentences(text);
      const spoken = parts.map((part) => speakable(part, EN));
      if (spoken.length === 0) return;
      const mine = turn.current;
      const live = () => turn.current === mine;
      current.current = id;
      let begun = false;
      let last = -1;
      // Marks the sentence being read; the first call means the voice has started.
      const at = (sentence: number) => {
        if (!live()) return;
        if (sentence !== last) {
          last = sentence;
          setReading({ id, sentence });
        }
        if (!begun) {
          begun = true;
          onStart?.();
        }
      };
      setReading({ id, sentence: 0 });

      // The phone's own voice, a sentence at a time.
      const deviceVoice = (from = 0) => {
        const say = (i: number) => {
          if (!live()) return;
          if (i >= spoken.length) return finish(id);
          Speech.speak(spoken[i], {
            language: EN ? 'en-US' : 'fi-FI',
            onStart: () => at(i),
            onDone: () => say(i + 1),
            onStopped: () => finish(id),
            onError: () => finish(id),
          });
        };
        say(from);
      };

      // Kokoro on the computer, streamed from the local server (Expo Go): each
      // sentence is fetched while the one before plays, so speech starts quickly.
      const serverVoice = async () => {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
        const prepare = (i: number) => {
          if (i < spoken.length) void fetch(speechUrl(spoken[i]), { headers: { Range: 'bytes=0-1' } }).catch(() => {});
        };
        const play = (i: number) => {
          if (!live()) return;
          if (i >= spoken.length) return finish(id);
          prepare(i + 1);
          const p = createAudioPlayer({ uri: speechUrl(spoken[i]) });
          player.current = p;
          let started = false;
          p.addListener('playbackStatusUpdate', (status) => {
            if (status.isLoaded && !started) {
              started = true;
              p.play();
            }
            if (status.playing) at(i);
            if (status.didJustFinish && player.current === p) {
              player.current = null;
              p.remove();
              play(i + 1);
            }
          });
          p.play();
        };
        play(0);
      };

      const engine = kokoro.current;
      if (!engine) {
        void serverHasVoice().then((voice) => {
          if (!live()) return;
          if (voice) serverVoice().catch(() => deviceVoice());
          else deviceVoice();
        });
        return;
      }
      engine
        .speak(spoken, at)
        .then((seconds) => {
          done.current = setTimeout(() => finish(id), seconds * 1000 + 150);
        })
        // If Kokoro fails, this answer is read with the phone's own voice.
        .catch(() => live() && deviceVoice());
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

  const speakingId = reading?.id ?? null;
  const sentence = reading?.sentence ?? -1;
  // A stable object, so callers' callbacks only change when the voice state does.
  return useMemo(
    () => ({ voiceOn, toggleVoice, speak, stop, speakingId, sentence, onKokoro }),
    [voiceOn, toggleVoice, speak, stop, speakingId, sentence, onKokoro],
  );
}
