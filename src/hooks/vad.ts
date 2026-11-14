/**
 * Voice activity: decides when a spoken question has ended. Pure functions
 * (no React Native), so they can be tested with plain number sequences.
 *
 * Loudness is compared with the room's own noise floor (the quietest moments
 * of the last few seconds), so it works in a quiet room and a noisy hall.
 */

export type VadState = {
  seconds: number;
  frames: number;
  speech: number;
  silence: number;
  heard: boolean;
  smooth: number | null;
  recent: number[];
};

const ASSUMED_FLOOR_DB = -55; // before the room has been heard
const CALIBRATION_FRAMES = 5; // about half a second
const LOUD_DB = -27; // this loud is speech whatever the room
const MIN_SPEECH_S = 0.3;
const END_SILENCE_S = 1.1;
const NO_SPEECH_GIVE_UP_S = 8;
const MAX_S = 30;
const FRAMES_KEPT = 60;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createVad(): VadState {
  return { seconds: 0, frames: 0, speech: 0, silence: 0, heard: false, smooth: null, recent: [] };
}

export function noiseFloor(s: VadState): number {
  if (s.recent.length < 3) return ASSUMED_FLOOR_DB;
  const sorted = [...s.recent].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.15)];
}

/** Feeds one buffer's loudness (dBFS) and length (s). Returns true when the question is over. */
export function stepVad(s: VadState, db: number, dt: number): boolean {
  s.seconds += dt;
  // The first buffers after the microphone opens can be digital silence.
  if (db > -90) {
    s.frames += 1;
    s.recent.push(db);
    if (s.recent.length > FRAMES_KEPT) s.recent.shift();
    s.smooth = s.smooth === null ? db : 0.6 * s.smooth + 0.4 * db;

    const floor = noiseFloor(s);
    const calibrated = s.frames > CALIBRATION_FRAMES;
    const isSpeech = db > LOUD_DB || (calibrated && db > clamp(floor + 12, -48, -18));
    if (isSpeech) {
      s.speech += dt;
      s.silence = 0;
      if (s.speech >= MIN_SPEECH_S) s.heard = true;
    } else if (s.smooth < clamp(floor + 9, -54, -22)) {
      s.silence += dt;
    }
  }
  return (s.heard && s.silence >= END_SILENCE_S) || s.seconds >= MAX_S || (!s.heard && s.seconds >= NO_SPEECH_GIVE_UP_S);
}
