import { clientLog } from '../api';

/**
 * The server's voice in a browser.
 *
 * Browsers only let a page start sound right after a click, tap or key press,
 * and an answer is read seconds after the question was sent, so the sound has
 * to be allowed in advance, during an earlier interaction:
 *
 * - iPhone, iPad and Safari: one <audio> element is played (silence) during the
 *   first tap; WebKit then lets that same element play later without a tap.
 *   Media elements also play with the iPhone's ring/silent switch off.
 * - Other browsers: an AudioContext resumed during an interaction stays allowed
 *   to play, and the sentences are played through it. It is also the fallback.
 */
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const webkit = /iPhone|iPad|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(ua));

let context: AudioContext | null = null;
let element: HTMLAudioElement | null = null;
/** The element has played during a tap, so it may play again later. */
let allowed = false;
/** The element is reading a sentence (do not unlock over it). */
let busy = false;
/** One tap sends several events; unlock with the first that counts. */
let unlocking = false;
let silence: string | null = null;

let reports = 0;
/** Sends what happened to the voice to the server log (for diagnosing phones remotely). */
export function report(event: string, data: Record<string, unknown> = {}) {
  if (reports++ >= 40) return;
  clientLog({ event, webkit, allowed, ctx: context?.state ?? 'none', session: session()?.type ?? 'none', ua: ua.slice(0, 140), ...data });
}

type SessionNavigator = Navigator & { audioSession?: { type: string } };
const session = () => (typeof navigator === 'undefined' ? undefined : (navigator as SessionNavigator).audioSession);

/**
 * Safari 16.4+ (iPhone): the page's audio session. Web Audio is "ambient" by
 * default there, silent when the ring/silent switch is off and quiet in the
 * earpiece after the microphone was used; "playback" makes it play like media.
 * Elsewhere this does nothing.
 */
export function setAudioSession(type: 'playback' | 'auto' | 'play-and-record') {
  const s = session();
  if (!s || s.type === type) return;
  try {
    s.type = type;
  } catch {
    // Not settable here.
  }
}

/** 0.05 s of silence as a WAV blob URL. */
function silentWav(): string {
  if (silence) return silence;
  const samples = 400;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  silence = URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
  return silence;
}

function unlock(event: Event) {
  // On touch screens only touchend/click count as a user gesture, not pointerdown.
  const gesture = event.type !== 'pointerdown' || (event as PointerEvent).pointerType === 'mouse';
  if (webkit && gesture && !allowed && !busy && !unlocking) {
    try {
      unlocking = true;
      element ??= new Audio();
      element.src = silentWav();
      element.play().then(
        () => {
          allowed = true;
          unlocking = false;
          report('unlocked', { via: event.type });
        },
        (error: Error) => {
          unlocking = false;
          report('unlock failed', { via: event.type, error: error.name });
        },
      );
    } catch (error) {
      report('unlock threw', { error: String(error) });
    }
  }
  // On iPhone a running AudioContext holds the audio session and can starve the speech
  // recognizer of the microphone, so WebKit uses the element only.
  if (webkit) return;
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
    // Safari on iPhone also wants a sound started inside the gesture.
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, 22050);
    source.connect(context.destination);
    source.start(0);
  } catch {
    // No Web Audio.
  }
}

if (typeof document !== 'undefined') {
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

const buffers = new Map<string, Promise<AudioBuffer>>();

function load(url: string): Promise<AudioBuffer> {
  const hit = buffers.get(url);
  if (hit) return hit;
  const job = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => context!.decodeAudioData(data));
  buffers.set(url, job);
  job.catch(() => buffers.delete(url));
  while (buffers.size > 40) buffers.delete(buffers.keys().next().value!);
  return job;
}

/** Asks the server to prepare a sentence (one byte is enough), so it is ready when its turn comes. */
/** How long a sentence may take to start playing before the voice gives up on the answer. */
const SENTENCE_START_MS = 6000;

const prepare = (url: string) => void fetch(url, { headers: { Range: 'bytes=0-1' } }).catch(() => {});

/**
 * Plays the sentences' audio in order, calling `onSentence` as each starts.
 * `done` rejects before any sound if the browser does not allow it yet.
 */
export function playWeb(urls: string[], onSentence: (index: number) => void, live: () => boolean) {
  let stopped = false;
  let halt = () => {};
  const stop = () => {
    stopped = true;
    halt();
  };
  const going = () => !stopped && live();
  let started = false;
  const begin = (i: number) => {
    started = true;
    onSentence(i);
  };

  const onElement = async () => {
    const el = element!;
    busy = true;
    try {
      for (let i = 0; i < urls.length && going(); i++) {
        if (i + 1 < urls.length) prepare(urls[i + 1]);
        await new Promise<void>((resolve, reject) => {
          const clear = () => {
            el.onplaying = el.onended = el.onerror = null;
          };
          halt = () => {
            clearTimeout(late);
            el.pause();
            clear();
            resolve();
          };
          // A sentence the server is still making (a slow moment on the small server):
          // better no voice than a voice half a minute after the answer appeared.
          const late = setTimeout(() => {
            el.pause();
            clear();
            reject(new Error('late'));
          }, SENTENCE_START_MS);
          el.onplaying = () => {
            clearTimeout(late);
            begin(i);
          };
          el.onended = () => {
            clearTimeout(late);
            clear();
            resolve();
          };
          el.onerror = () => {
            clear();
            reject(new Error(`audio error ${el.error?.code ?? ''}`));
          };
          el.src = urls[i];
          el.play().catch((error: Error) => {
            clear();
            reject(error);
          });
        });
      }
    } finally {
      busy = false;
    }
  };

  const onContext = async () => {
    if (!context) throw new Error('No audio yet');
    if (context.state !== 'running') {
      // resume() stays pending without a gesture, so do not wait for it long; after the
      // microphone, iOS reports "interrupted" for a moment before it lets go.
      const wait = context.state === 'interrupted' ? 1500 : 300;
      await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, wait))]);
      if ((context.state as AudioContextState) !== 'running') throw new Error(`Audio context ${context.state}`);
    }
    for (let i = 0; i < urls.length && going(); i++) {
      const buffer = await load(urls[i]);
      if (i + 1 < urls.length) void load(urls[i + 1]).catch(() => {});
      if (!going()) return;
      await new Promise<void>((resolve) => {
        const source = context!.createBufferSource();
        source.buffer = buffer;
        source.connect(context!.destination);
        source.onended = () => resolve();
        halt = () => {
          try {
            source.stop();
          } catch {
            // Already over.
          }
          resolve();
        };
        begin(i);
        source.start();
      });
    }
  };

  const done = (async () => {
    setAudioSession('playback');
    if (webkit && element && allowed) {
      try {
        await onElement();
        return;
      } catch (error) {
        report('element failed', { error: (error as Error).message, started });
        return; // the text is on screen; no Web Audio fallback on WebKit (see unlock)
      }
    }
    try {
      await onContext();
    } catch (error) {
      report('context failed', { error: (error as Error).message, started });
      throw error;
    }
  })();
  if (webkit) report('speak', { sentences: urls.length, path: element && allowed ? 'element' : 'context' });
  return { stop, done };
}
