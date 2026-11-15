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
  /** The room's noise level (dBFS): quick to fall, slow to rise, never lifted by speech. */
  floor: number;
  /** The first buffers, to measure the room before anyone speaks. */
  recent: number[];
};

const ASSUMED_FLOOR_DB = -55; // before the room has been heard
const CALIBRATION_FRAMES = 5; // about half a second
const LOUD_DB = -27; // this loud is speech whatever the room
const SPEECH_OVER_FLOOR_DB = 8;
const SILENCE_OVER_FLOOR_DB = 5;
const MIN_SPEECH_S = 0.3;
const END_SILENCE_S = 1.5;
const NO_SPEECH_GIVE_UP_S = 8;
const MAX_S = 30;

export function createVad(): VadState {
  return { seconds: 0, frames: 0, speech: 0, silence: 0, heard: false, smooth: null, floor: ASSUMED_FLOOR_DB, recent: [] };
}

export function noiseFloor(s: VadState): number {
  return s.floor;
}

/** Feeds one buffer's loudness (dBFS) and length (s). Returns true when the question is over. */
export function stepVad(s: VadState, db: number, dt: number): boolean {
  s.seconds += dt;
  // The first buffers after the microphone opens can be digital silence.
  if (db > -90) {
    s.frames += 1;
    s.smooth = s.smooth === null ? db : 0.6 * s.smooth + 0.4 * db;
    if (s.frames <= CALIBRATION_FRAMES) {
      // Before anyone speaks: the room is the median of the first buffers.
      s.recent.push(db);
      const sorted = [...s.recent].sort((a, b) => a - b);
      s.floor = sorted[Math.floor(sorted.length / 2)];
    } else if (db < s.floor) {
      s.floor = 0.7 * s.floor + 0.3 * db;
    } else if (db < s.floor + SILENCE_OVER_FLOOR_DB) {
      // Only levels close to the floor may raise it, and slowly: speech, even soft, never does.
      s.floor += 0.03 * (db - s.floor);
    }
    const isSpeech = db > LOUD_DB || (s.frames > CALIBRATION_FRAMES && db > Math.max(s.floor + SPEECH_OVER_FLOOR_DB, -50));
    if (isSpeech) {
      s.speech += dt;
      s.silence = 0;
      if (s.speech >= MIN_SPEECH_S) s.heard = true;
    } else if (s.smooth < s.floor + SILENCE_OVER_FLOOR_DB) {
      s.silence += dt;
    }
  }
  return (s.heard && s.silence >= END_SILENCE_S) || s.seconds >= MAX_S || (!s.heard && s.seconds >= NO_SPEECH_GIVE_UP_S);
}
