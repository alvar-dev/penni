/**
 * The server's voice in a browser, played through one AudioContext.
 *
 * Browsers only let a page start sound right after a click, tap or key press,
 * and an answer is read seconds after the question was sent; an <audio>
 * element started then is blocked. An AudioContext that was resumed during an
 * earlier interaction stays allowed to play, so it is unlocked on every
 * interaction (cheap) and the sentences are played through it.
 */
let context: AudioContext | null = null;

function unlock() {
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
    // Safari on iPhone also wants a sound started inside the gesture.
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, 22050);
    source.connect(context.destination);
    source.start(0);
  } catch {
    // No Web Audio: the browser's own voice is used instead.
  }
}

if (typeof document !== 'undefined') {
  for (const type of ['pointerdown', 'touchend', 'keydown']) {
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

/**
 * Plays the sentences' audio in order, calling `onSentence` as each starts.
 * `done` rejects before any sound if audio is not allowed yet (no interaction).
 */
export function playWeb(urls: string[], onSentence: (index: number) => void, live: () => boolean) {
  let current: AudioBufferSourceNode | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    try {
      current?.stop();
    } catch {
      // Already over.
    }
  };
  const done = (async () => {
    if (!context) throw new Error('No audio yet');
    if (context.state !== 'running') {
      // resume() stays pending without a gesture, so do not wait for it long.
      await Promise.race([context.resume(), new Promise((resolve) => setTimeout(resolve, 300))]);
      if ((context.state as AudioContextState) !== 'running') throw new Error('Audio is not allowed yet');
    }
    for (let i = 0; i < urls.length; i++) {
      const buffer = await load(urls[i]);
      if (i + 1 < urls.length) void load(urls[i + 1]).catch(() => {});
      if (stopped || !live()) return;
      await new Promise<void>((resolve) => {
        const source = context!.createBufferSource();
        source.buffer = buffer;
        source.connect(context!.destination);
        source.onended = () => resolve();
        current = source;
        onSentence(i);
        source.start();
      });
      if (stopped || !live()) return;
    }
  })();
  return { stop, done };
}
