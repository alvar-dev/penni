/**
 * Local API for the app. Holds the Featherless key, which must never be
 * bundled into the app itself.
 *
 *   npm run server
 *
 *   GET  /health      -> { ok, model, today, asksToday, speech }
 *   GET  /summary?personaId=…  -> start-screen tiles and questions (no model involved)
 *   POST /ask         { personaId, question, history } -> { text, viz? } | { error }
 *   POST /transcribe  { audio: base64 16-bit mono PCM, sampleRate } -> { text } | { error }
 *
 * Speech is recognised locally by Whisper (stt/server.py), which this server
 * starts as a child process on 127.0.0.1:8788. Audio never leaves the computer.
 *
 * It listens on the local network so a phone running Expo Go can reach it.
 * Because a hackathon network is shared, every request must carry the app
 * token, and asks are rate limited so the API budget cannot be drained.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';
import { extname } from 'node:path';

import type { AskRequest, HistoryItem } from '../src/shared/api.ts';
import { bankById } from '../src/shared/banks.ts';
import { sentences } from '../src/shared/sentences.ts';
import { speakable } from '../src/shared/speakable.ts';
import { personas, summary, TODAY, withOtherBanks, type Persona } from './engine.mts';
import type { ToolCall, Viz } from '../src/shared/api.ts';
import { askModel, MODEL, tidy } from './llm.mts';
import { EN, LANG, tr } from './lang.mts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? '';
const MAX_PER_MINUTE = Number(process.env.MAX_ASKS_PER_MINUTE ?? 12);
const MAX_PER_DAY = Number(process.env.MAX_ASKS_PER_DAY ?? 300);

if (!process.env.FEATHERLESS_API_KEY) {
  console.error('FEATHERLESS_API_KEY is missing. Put it in .env.local and start with `npm run server`.');
  process.exit(1);
}
if (!TOKEN) {
  console.error('EXPO_PUBLIC_API_TOKEN is missing from .env.local; refusing to listen on the network without it.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Local speech recognition (Whisper) as a child process.

const STT_PORT = 8788;
const STT_PYTHON = new URL('../stt/.venv/bin/python', import.meta.url).pathname;
const STT_SCRIPT = new URL('../stt/server.py', import.meta.url).pathname;
/** The speech service is up (with Whisper on a Mac, voice only elsewhere). */
let sttStarted = false;
let speechReady = false;
/** Kokoro reads answers aloud for Expo Go (the installed app runs Kokoro on the phone). */
let voiceReady = false;
let stt: ChildProcess | null = null;

if (existsSync(STT_PYTHON)) {
  stt = spawn(STT_PYTHON, [STT_SCRIPT], { env: { ...process.env, STT_PORT: String(STT_PORT), STT_LANGUAGE: LANG }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [stt.stdout!, stt.stderr!]) {
    createInterface({ input: stream }).on('line', (line) => {
      if (line.includes('[stt] ready')) {
        sttStarted = true;
        speechReady = !line.includes('whisper off');
        voiceReady = !line.includes('voice off');
      }
      if (line.startsWith('[stt]') || line.startsWith('[tts]') || /error|traceback/i.test(line)) console.log(line);
    });
  }
  stt.on('exit', (code) => {
    sttStarted = false;
    speechReady = false;
    voiceReady = false;
    console.error(`[stt] stopped (exit ${code}); voice questions are unavailable`);
  });
  const stop = () => stt?.kill();
  process.on('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  }
} else {
  console.warn('[stt] stt/.venv not found; voice questions are unavailable (see stt/server.py)');
}

const recentTranscriptions: number[] = [];
const recentSpeech: number[] = [];
/**
 * Spoken sentences, kept in memory and on disk (server/.cache/speech), so a
 * sentence is synthesized once: the player asks for the same audio in several
 * ranges, answers are prepared before they are sent, and demo answers survive
 * restarts. `background` work (preparing ahead) is not rate-limited.
 */
const speechCache = new Map<string, Promise<Buffer>>();
const SPEECH_DIR = new URL('./.cache/speech/', import.meta.url);

function spoken(text: string, background = false): Promise<Buffer> {
  const key = createHash('sha1').update(`${LANG}|${text}`).digest('hex');
  const hit = speechCache.get(key);
  if (hit) return hit;
  const file = new URL(`${key}.wav`, SPEECH_DIR);
  if (existsSync(file)) {
    const saved = Promise.resolve(readFileSync(file));
    speechCache.set(key, saved);
    return saved;
  }
  if (!background) {
    const now = Date.now();
    while (recentSpeech.length && now - recentSpeech[0] > 60_000) recentSpeech.shift();
    if (recentSpeech.length >= 30) return Promise.reject(new Error('busy'));
    recentSpeech.push(now);
  }
  const job = fetch(`http://127.0.0.1:${STT_PORT}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30_000),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`speech service ${response.status}`);
    const audio = Buffer.from(await response.arrayBuffer());
    try {
      mkdirSync(SPEECH_DIR, { recursive: true });
      writeFileSync(file, audio);
    } catch {
      // Memory is enough.
    }
    return audio;
  });
  speechCache.set(key, job);
  job.catch(() => speechCache.delete(key));
  while (speechCache.size > 300) speechCache.delete(speechCache.keys().next().value!);
  return job;
}

/** Background speech work runs one sentence at a time, so it never crowds out a live answer. */
let speechQueue: Promise<unknown> = Promise.resolve();

/**
 * Prepares an answer's audio: the first sentence now (resolves when it is
 * ready), the rest queued behind it. The same splitting and wording as the app.
 */
function prepareSpeech(answerText: string): Promise<unknown> {
  if (!voiceReady) return Promise.resolve();
  const parts = sentences(answerText).map((part) => speakable(part, EN));
  if (parts.length === 0) return Promise.resolve();
  const first = spoken(parts[0], true).catch(() => undefined);
  for (const part of parts.slice(1)) speechQueue = speechQueue.then(() => spoken(part, true).catch(() => undefined));
  return first;
}

/** Waits for the first sentence's audio, but never more than `ms`. */
const readyToSpeak = (answerText: string, ms = 2500) =>
  Promise.race([prepareSpeech(answerText), new Promise((resolve) => setTimeout(resolve, ms))]);

async function transcribe(body: unknown): Promise<{ status: number; body: unknown }> {
  if (!speechReady) return { status: 503, body: { error: 'Speech recognition is still starting' } };
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.audio !== 'string' || !b.audio) return { status: 400, body: { error: 'audio (base64) is required' } };
  const rate = Number(b.sampleRate ?? 16000);
  if (!Number.isFinite(rate) || rate < 8000 || rate > 48000) return { status: 400, body: { error: 'Bad sampleRate' } };
  const now = Date.now();
  while (recentTranscriptions.length && now - recentTranscriptions[0] > 60_000) recentTranscriptions.shift();
  if (recentTranscriptions.length >= 20) return { status: 429, body: { error: 'Too many voice questions in a minute' } };
  recentTranscriptions.push(now);

  const pcm = Buffer.from(b.audio, 'base64');
  const response = await fetch(`http://127.0.0.1:${STT_PORT}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': String(Math.round(rate)) },
    body: pcm,
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, body: await response.json() };
}

// ---------------------------------------------------------------------------
// Answer cache: a first question (no history) for the same customer gets the
// same answer, so repeated demo questions are instant and cost nothing.
// Delete server/.cache/answers.json to start fresh (e.g. after prompt changes).

type Cached = { text: string; viz?: Viz; call?: ToolCall; sources?: string[] };
const CACHE_FILE = new URL('./.cache/answers.json', import.meta.url);
const cache = new Map<string, Cached>();
try {
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Record<string, Cached>)) cache.set(k, v);
} catch {
  // No cache yet.
}
const cacheKey = (personaId: string, question: string, banks: string[] = []) =>
  `${MODEL}|${TODAY}|${EN ? 'en|' : ''}${personaId}${banks.length ? `+${[...banks].sort().join('+')}` : ''}|${question.toLowerCase().replace(/[^a-z0-9€%]+/g, ' ').trim()}`;
function remember(key: string, value: Cached) {
  cache.set(key, value);
  try {
    mkdirSync(new URL('./.cache/', import.meta.url), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 1));
  } catch (error) {
    console.error('[cache] could not save:', (error as Error).message);
  }
}

/** With DEMO_PREWARM=1, answers the start screen's questions for the demo customer in the background. */
/** The customer as the app sees them: with or without a second bank connected (PSD2). */
function customer(personaId: string, banks: string[] = []): Persona | undefined {
  const base = personas.get(personaId);
  return base && banks.length ? withOtherBanks(base, banks) : base;
}

/** Only S-Pankki, then the bank combinations most likely shown in a demo (DEMO_BANKS: "op;revolut;op+revolut"). */
async function prewarm(personaId: string) {
  const combos = (process.env.DEMO_BANKS ?? 'op;revolut;op+revolut').split(';').map((c) => c.split('+').filter((b) => bankById(b)));
  for (const banks of [[], ...combos]) await prewarmFor(personaId, banks);
  // Then the demo answers' audio, so they are read the moment they appear.
  for (let i = 0; i < 120 && !sttStarted; i++) await new Promise((resolve) => setTimeout(resolve, 500));
  if (!voiceReady) return;
  const prefix = `${MODEL}|${TODAY}|${EN ? 'en|' : ''}${personaId}`;
  const texts = [...cache.entries()].filter(([k]) => k.startsWith(prefix) && k.slice(prefix.length).match(/^[+|]/)).map(([, v]) => tidy(v.text));
  for (const text of texts) await prepareSpeech(text);
  await speechQueue;
  console.log(`[prewarm] audio ready for ${texts.length} answers`);
}

/** Bank ids from a request: known ones only, each once, sorted. */
function bankList(value: unknown): string[] {
  const ids = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(ids.filter((b): b is string => typeof b === 'string' && !!bankById(b)))].sort();
}

async function prewarmFor(personaId: string, banks: string[]) {
  const persona = customer(personaId, banks);
  if (!persona) return;
  const s = summary(persona);
  const questions = [
    ...new Set([
      ...s.tiles.map((t) => t.question),
      ...s.suggestions,
      ...(s.insight ? [s.insight.question] : []),
      // The question that leads to (and, once connected, shows) the multi-bank view.
      tr('Paljonko minulla on rahaa yhteensä?', 'How much money do I have in total?'),
    ]),
  ];
  for (const question of questions) {
    const key = cacheKey(personaId, question, banks);
    if (cache.has(key)) continue;
    try {
      const answer = await askModel(persona, question, []);
      spentUsd += answer.usage.usd ?? 0;
      remember(key, { text: answer.text, viz: answer.viz, call: answer.call, sources: answer.sources });
      console.log(`[prewarm] ${question} · $${(answer.usage.usd ?? 0).toFixed(4)}`);
    } catch (error) {
      console.error(`[prewarm] failed: ${question}:`, (error as Error).message);
    }
  }
  console.log(`[prewarm] ready: ${questions.length} questions cached for ${personaId}${banks.length ? ` + ${banks.join(' + ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// Question limits

const recent: number[] = [];
let day = new Date().toISOString().slice(0, 10);
let asksToday = 0;
let spentUsd = 0;

function allowAsk(): string | null {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    asksToday = 0;
  }
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= MAX_PER_MINUTE) return 'Too many questions in a minute. Try again shortly.';
  if (asksToday >= MAX_PER_DAY) return 'Daily question limit reached.';
  recent.push(now);
  asksToday += 1;
  return null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 20_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseAsk(body: unknown): AskRequest | string {
  if (!body || typeof body !== 'object') return 'Expected a JSON object';
  const b = body as Record<string, unknown>;
  if (typeof b.personaId !== 'string' || !personas.has(b.personaId)) return 'Unknown personaId';
  if (typeof b.question !== 'string' || !b.question.trim() || b.question.length > 500) return 'question must be 1–500 characters';
  const history: HistoryItem[] = [];
  if (Array.isArray(b.history)) {
    for (const item of b.history.slice(-6)) {
      const h = item as Record<string, unknown>;
      if ((h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim()) {
        const c = h.call as Record<string, unknown> | undefined;
        const call =
          c && typeof c.name === 'string' && c.args && typeof c.args === 'object' && JSON.stringify(c.args).length < 500
            ? { name: c.name, args: c.args as Record<string, unknown> }
            : undefined;
        history.push({ role: h.role, text: h.text.slice(0, 1500), call });
      }
    }
  }
  return { personaId: b.personaId, question: b.question.trim(), history, banks: bankList(b.banks), serverVoice: b.serverVoice === true };
}

const clientLogs: number[] = [];

// The web version (scripts/build-web.sh builds it into web/): the same app in a browser.
const WEB_DIR = new URL('../web/', import.meta.url);
const WEB_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

/** Serves a file of the web version; unknown paths get the app's index.html. */
function serveWeb(req: IncomingMessage, res: ServerResponse): boolean {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    return false;
  }
  if (path.includes('..') || path.includes('\\')) return false;
  let file = new URL(`.${path}`, WEB_DIR);
  if (!file.pathname.startsWith(WEB_DIR.pathname)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = new URL('index.html', WEB_DIR);
  if (!existsSync(file)) return false;
  // Bundles and assets carry a content hash in their names, so they never change.
  const hashed = path.startsWith('/_expo/') || path.startsWith('/assets/');
  res.writeHead(200, {
    'Content-Type': WEB_TYPES[extname(file.pathname)] ?? 'application/octet-stream',
    'Content-Length': statSync(file).size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  // The Android build, for anyone to try (Junction's Project Demo link). Put the file in public/.
  if (req.method === 'GET' && req.url === '/download/penni.apk') {
    const apk = new URL('../public/penni.apk', import.meta.url);
    if (!existsSync(apk)) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': statSync(apk).size,
      'Content-Disposition': 'attachment; filename="Penni.apk"',
    });
    createReadStream(apk).pipe(res);
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, model: MODEL, today: TODAY, asksToday, speech: speechReady, voice: voiceReady });
  }
  if (req.method === 'GET' && req.url?.startsWith('/summary')) {
    if (req.headers['x-app-token'] !== TOKEN) return send(res, 401, { error: 'Unauthorized' });
    const params = new URL(req.url, 'http://localhost').searchParams;
    const persona = customer(params.get('personaId') ?? '', bankList(params.get('banks')));
    return persona ? send(res, 200, summary(persona)) : send(res, 404, { error: 'Unknown personaId' });
  }
  // GET /speak?text=…&token=… -> audio/wav, so the app's audio player can stream it from a URL.
  // iOS's player fetches media in byte ranges, so ranges are served from a short cache.
  if (req.method === 'GET' && req.url?.startsWith('/speak')) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    if ((req.headers['x-app-token'] ?? params.get('token')) !== TOKEN) return send(res, 401, { error: 'Unauthorized' });
    if (!voiceReady) return send(res, 503, { error: 'No voice on this server' });
    const text = (params.get('text') ?? '').trim().slice(0, 1500);
    if (!text) return send(res, 400, { error: 'text is required' });
    let audio: Buffer;
    try {
      audio = await spoken(text);
    } catch (error) {
      console.error('[tts] request failed:', (error as Error).message);
      return send(res, (error as Error).message === 'busy' ? 429 : 502, { error: 'Speech synthesis failed' });
    }
    const range = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ''));
    console.log(`[tts] GET ${req.headers.range ?? 'whole'} of ${audio.length} bytes (${req.headers['user-agent']?.slice(0, 40) ?? '-'})`);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
      if (start >= audio.length || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${audio.length}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${audio.length}`,
        'Content-Length': end - start + 1,
      });
      return res.end(audio.subarray(start, end + 1));
    }
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': audio.length });
    return res.end(audio);
  }
  // Diagnostics from the web version (src/tts/webVoice.ts): what happened to the voice on a phone.
  if (req.method === 'POST' && req.url === '/clientlog') {
    if (req.headers['x-app-token'] !== TOKEN) return send(res, 401, { error: 'Unauthorized' });
    const now = Date.now();
    while (clientLogs.length && now - clientLogs[0] > 60_000) clientLogs.shift();
    if (clientLogs.length >= 60) return send(res, 429, { error: 'Too many' });
    clientLogs.push(now);
    try {
      console.log(`[client] ${JSON.stringify(await readJson(req, 2000)).slice(0, 500)}`);
    } catch {
      return send(res, 400, { error: 'Invalid JSON' });
    }
    return send(res, 204, {});
  }
  if (req.method === 'GET' && serveWeb(req, res)) return;
  if (req.method !== 'POST' || (req.url !== '/ask' && req.url !== '/transcribe')) return send(res, 404, { error: 'Not found' });
  if (req.headers['x-app-token'] !== TOKEN) return send(res, 401, { error: 'Unauthorized' });

  if (req.url === '/transcribe') {
    try {
      // About 60 s of 16 kHz audio once base64-encoded.
      const result = await transcribe(await readJson(req, 2_700_000));
      return send(res, result.status, result.body);
    } catch (error) {
      console.error('[stt] request failed:', (error as Error).message);
      return send(res, 502, { error: 'Speech recognition failed' });
    }
  }

  let parsed: AskRequest | string;
  try {
    parsed = parseAsk(await readJson(req));
  } catch {
    return send(res, 400, { error: 'Invalid JSON' });
  }
  if (typeof parsed === 'string') return send(res, 400, { error: parsed });
  const key = parsed.history.length === 0 ? cacheKey(parsed.personaId, parsed.question, parsed.banks) : null;
  const hit = key ? cache.get(key) : undefined;
  if (hit) {
    console.log(`[ask] ${parsed.personaId} cached | ${parsed.question.slice(0, 80)}`);
    const text = tidy(hit.text);
    if (parsed.serverVoice) await readyToSpeak(text);
    return send(res, 200, { ...hit, text });
  }
  const limited = allowAsk();
  if (limited) return send(res, 429, { error: limited });

  const started = Date.now();
  try {
    const answer = await askModel(customer(parsed.personaId, parsed.banks)!, parsed.question, parsed.history);
    spentUsd += answer.usage.usd ?? 0;
    console.log(
      `[ask] ${parsed.personaId} tool=${answer.tool ?? '-'} ${((Date.now() - started) / 1000).toFixed(1)}s ` +
        `tokens=${answer.usage.input}/${answer.usage.output} ` +
        `cost=$${(answer.usage.usd ?? 0).toFixed(4)} total=$${spentUsd.toFixed(3)} | ${parsed.question.slice(0, 80)}`,
    );
    if (key) remember(key, { text: answer.text, viz: answer.viz, call: answer.call, sources: answer.sources });
    if (parsed.serverVoice) await readyToSpeak(answer.text);
    return send(res, 200, { text: answer.text, viz: answer.viz, call: answer.call, sources: answer.sources });
  } catch (error) {
    console.error(`[ask] failed after ${((Date.now() - started) / 1000).toFixed(1)}s:`, (error as Error).message);
    return send(res, 502, { error: 'The model did not answer' });
  }
});

server.listen(PORT, HOST, () => {
  if (process.env.DEMO_PREWARM === '1') void prewarm(process.env.DEMO_PERSONA ?? 'CUST03915');
  console.log(`API on http://${HOST}:${PORT} · model ${MODEL} · data up to ${TODAY} · limits ${MAX_PER_MINUTE}/min, ${MAX_PER_DAY}/day`);
});
