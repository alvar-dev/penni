import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

type SpeechModule = typeof ExpoSpeechRecognitionModule;

/**
 * The phone's own speech recognizer (Google's on Android, Apple's on iOS).
 * It exists in the installed app (APK) but not in Expo Go, where questions are
 * recognised by the local Whisper service instead.
 */
export const deviceSpeech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');

export const SPEECH_LANG = 'fi-FI';

let onDevice: Promise<boolean> | null = null;

/**
 * Whether Finnish can be recognised on the phone itself, so the audio never
 * leaves it. On Android that needs the offline Finnish model of Google's
 * on-device service; otherwise Google's online recognition is used.
 */
export function canRecognizeOnDevice(): Promise<boolean> {
  if (!deviceSpeech || Platform.OS !== 'android') return Promise.resolve(false);
  onDevice ??= deviceSpeech
    .getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' })
    .then(({ installedLocales }) => installedLocales.some((l) => l.toLowerCase().startsWith('fi')))
    .catch(() => false);
  return onDevice;
}
