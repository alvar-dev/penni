import { Component, useEffect, useRef, type ReactNode } from 'react';
import { AudioContext, type AudioBufferSourceNode } from 'react-native-audio-api';
import { KOKORO_SAMPLE_RATE, models, setTelemetryEnabled, useTextToSpeech } from 'react-native-executorch';

/**
 * What the app can ask of the on-device voice: `speak` reads the sentences in
 * turn, calls `onSentence` as each starts to play, and resolves with the
 * seconds still to play once all are queued.
 */
export type KokoroApi = { speak: (sentences: string[], onSentence: (index: number) => void) => Promise<number>; stop: () => void };

// No anonymous download events from the model downloads.
setTelemetryEnabled(false);

/**
 * Kokoro (af_heart) on the phone itself, through ExecuTorch. The model is
 * downloaded once on first launch and then works offline. Sentences are
 * synthesized one by one and queued gaplessly, so speech starts right away.
 * Only loaded in the installed app (not Expo Go); renders nothing.
 */
export function KokoroEngine({ onApi }: { onApi: (api: KokoroApi | null) => void }) {
  return (
    <Contain onError={() => onApi(null)}>
      <Engine onApi={onApi} />
    </Contain>
  );
}

/** Keeps a failing voice engine from taking the app down; the phone's voice takes over. */
class Contain extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Engine({ onApi }: { onApi: (api: KokoroApi | null) => void }) {
  const tts = useTextToSpeech(models.textToSpeech.KOKORO.EN_US.DEFAULT);
  const report = useRef(onApi);
  useEffect(() => {
    report.current = onApi;
  }, [onApi]);

  const { isReady, synthesize, synthesizeStop } = tts;
  useEffect(() => {
    if (!isReady || !synthesize || !synthesizeStop) {
      report.current(null);
      return;
    }
    const context = new AudioContext({ sampleRate: KOKORO_SAMPLE_RATE });
    let sources: AudioBufferSourceNode[] = [];
    let timers: ReturnType<typeof setTimeout>[] = [];
    let turn = 0;
    const silence = () => {
      timers.forEach(clearTimeout);
      timers = [];
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already finished.
        }
      }
      sources = [];
    };
    const api: KokoroApi = {
      async speak(parts, onSentence) {
        const mine = ++turn;
        synthesizeStop();
        silence();
        let at = context.currentTime + 0.05;
        for (let index = 0; index < parts.length; index++) {
          // The pipeline may still be finishing a cancelled sentence; try again briefly.
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              let first = true;
              for await (const chunk of synthesize(parts[index], { voice: 'af_heart' })) {
                if (mine !== turn) return 0;
                const buffer = context.createBuffer(1, chunk.audio.length, chunk.sampleRate);
                buffer.copyToChannel(chunk.audio as Float32Array<ArrayBuffer>, 0);
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                at = Math.max(at, context.currentTime + 0.02);
                if (first) {
                  first = false;
                  const i = index;
                  timers.push(setTimeout(() => mine === turn && onSentence(i), Math.max(0, (at - context.currentTime) * 1000)));
                }
                source.start(at);
                at += buffer.duration;
                sources.push(source);
              }
              break;
            } catch (error) {
              if (mine !== turn || attempt === 4) throw error;
              await new Promise((resolve) => setTimeout(resolve, 150));
            }
          }
        }
        return Math.max(0, at - context.currentTime);
      },
      stop() {
        turn++;
        synthesizeStop();
        silence();
      },
    };
    report.current(api);
    return () => {
      report.current(null);
      api.stop();
      void context.close();
    };
  }, [isReady, synthesize, synthesizeStop]);

  return null;
}
