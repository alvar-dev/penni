import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { EN } from '../lang';
import { setAudioSession } from '../tts/webVoice';
import { createVad, stepVad } from './vad';

/**
 * The browser's own speech recognizer (Chrome, Edge, Safari). Browsers without
 * one (Firefox) get null, and the app offers typing instead.
 *
 * Browsers report no loudness, so a small microphone meter drives the orb and
 * the waveform as the phone's recognizer does ("volumechange", -2..10), and
 * ends the question after a pause (the same detector as vad.ts uses for
 * recordings): browsers' own end-of-speech is unreliable, Safari keeps
 * repeating results in silence. The meter is left out on iPhone and iPad, where
 * a second microphone user can stop Safari's recognizer.
 */
const available =
  typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export const deviceSpeech = available ? ExpoSpeechRecognitionModule : null;

export const SPEECH_LANG = EN ? 'en-US' : 'fi-FI';

export function canRecognizeOnDevice(): Promise<boolean> {
  return Promise.resolve(false);
}

const appleMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
let meter: { stop: () => void } | null = null;
/** Ends the question (stops the recognizer, which then sends its last words and "end"). */
let endQuestion: () => void = () => {};

async function startMeter() {
  stopMeter();
  if (appleMobile || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const vad = createVad();
    let ended = false;
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const db = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-7);
      // -60 dBFS (silence) .. -15 dBFS (close speech) onto the recognizer's -2..10.
      const value = Math.max(-2, Math.min(10, ((db + 60) / 45) * 12 - 2));
      ExpoSpeechRecognitionModule.emit('volumechange', { value });
      if (!ended && stepVad(vad, db, 0.09)) {
        ended = true;
        endQuestion();
      }
    }, 90);
    meter = {
      stop: () => {
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        void context.close().catch(() => {});
      },
    };
  } catch {
    // No meter: recognition still works, the orb just stays calm.
  }
}

function stopMeter() {
  meter?.stop();
  meter = null;
}

if (deviceSpeech) {
  const start = deviceSpeech.start.bind(deviceSpeech);
  const stop = deviceSpeech.stop.bind(deviceSpeech);
  deviceSpeech.start = (options) => {
    // The answers' voice switches Safari to "playback", which cannot record.
    setAudioSession('auto');
    start(options);
    void startMeter();
  };
  deviceSpeech.stop = () => {
    stop();
    stopMeter();
  };
  endQuestion = () => deviceSpeech.stop();
  deviceSpeech.addListener('end', stopMeter);
}
