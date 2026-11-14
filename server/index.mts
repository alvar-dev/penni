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
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';

import type { AskRequest, HistoryItem } from '../src/shared/api.ts';
import { personas, summary, TODAY } from './engine.mts';
import { askModel, MODEL } from './llm.mts';

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
let speechReady = false;
let stt: ChildProcess | null = null;

if (existsSync(STT_PYTHON)) {
  stt = spawn(STT_PYTHON, [STT_SCRIPT], { env: { ...process.env, STT_PORT: String(STT_PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [stt.stdout!, stt.stderr!]) {
    createInterface({ input: stream }).on('line', (line) => {
      if (line.includes('[stt] ready')) speechReady = true;
      if (line.startsWith('[stt]') || /error|traceback/i.test(line)) console.log(line);
    });
  }
  stt.on('exit', (code) => {
    speechReady = false;
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
        history.push({ role: h.role, text: h.text.slice(0, 1500) });
      }
    }
  }
  return { personaId: b.personaId, question: b.question.trim(), history };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, model: MODEL, today: TODAY, asksToday, speech: speechReady });
  }
  if (req.method === 'GET' && req.url?.startsWith('/summary')) {
    if (req.headers['x-app-token'] !== TOKEN) return send(res, 401, { error: 'Unauthorized' });
    const id = new URL(req.url, 'http://localhost').searchParams.get('personaId') ?? '';
    const persona = personas.get(id);
    return persona ? send(res, 200, summary(persona)) : send(res, 404, { error: 'Unknown personaId' });
  }
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
  const limited = allowAsk();
  if (limited) return send(res, 429, { error: limited });

  const started = Date.now();
  try {
    const answer = await askModel(personas.get(parsed.personaId)!, parsed.question, parsed.history);
    spentUsd += answer.usage.usd ?? 0;
    console.log(
      `[ask] ${parsed.personaId} tool=${answer.tool ?? '-'} ${((Date.now() - started) / 1000).toFixed(1)}s ` +
        `tokens=${answer.usage.input}/${answer.usage.output} ` +
        `cost=$${(answer.usage.usd ?? 0).toFixed(4)} total=$${spentUsd.toFixed(3)} | ${parsed.question.slice(0, 80)}`,
    );
    return send(res, 200, { text: answer.text, viz: answer.viz });
  } catch (error) {
    console.error(`[ask] failed after ${((Date.now() - started) / 1000).toFixed(1)}s:`, (error as Error).message);
    return send(res, 502, { error: 'The model did not answer' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`API on http://${HOST}:${PORT} · model ${MODEL} · data up to ${TODAY} · limits ${MAX_PER_MINUTE}/min, ${MAX_PER_DAY}/day`);
});
