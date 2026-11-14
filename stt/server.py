"""Local speech-to-text for the app (English): Whisper large-v3-turbo on Apple Silicon (MLX).

Started by the API server (server/index.mts); it is not meant to be reached
from the network, so it listens on 127.0.0.1 only.

    POST /transcribe   body: raw 16-bit little-endian mono PCM
                       header X-Sample-Rate (default 16000)
                       -> {"text": "..."}
    GET  /health       -> {"ok": true}

Audio never leaves this computer. The model loads once and stays in memory.
"""
import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import mlx_whisper
import numpy as np

MODEL = os.environ.get('STT_MODEL', 'mlx-community/whisper-large-v3-turbo')
LANGUAGE = os.environ.get('STT_LANGUAGE', 'en')
PORT = int(os.environ.get('STT_PORT', '8788'))
MAX_BYTES = 16000 * 2 * 60  # one minute of 16 kHz audio

# Whisper's well-known inventions on near-silent input (cf. ~/Programming/jari).
JUNK = {'', '.', '..', '...', 'you', 'you.', 'thank you.', 'thank you!', 'thanks for watching!', 'thank you for watching.', 'bye.'}

lock = Lock()  # one transcription at a time; MLX work is not worth interleaving


def to_float(pcm: bytes, rate: int) -> np.ndarray:
    audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
    if rate != 16000 and len(audio):
        n = int(round(len(audio) * 16000 / rate))
        audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
    return audio


def trim_loops(text: str) -> str:
    """Cuts a word that Whisper got stuck repeating ("vää, vää, vää, ...") to one."""
    return re.sub(r'\b(\w+)(?:[\s,.]+\1\b){3,}', r'\1', text)


def transcribe(audio: np.ndarray) -> str:
    # No initial prompt: on unclear audio Whisper tends to echo the prompt back.
    # The temperature ladder re-decodes a segment that came out as a repetition loop.
    with lock:
        result = mlx_whisper.transcribe(
            audio, path_or_hf_repo=MODEL, language=LANGUAGE, temperature=(0.0, 0.2, 0.4),
            condition_on_previous_text=False, no_speech_threshold=0.5)
    text = trim_loops((result.get('text') or '').strip())
    return '' if text.lower() in JUNK else text


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, {'ok': True, 'model': MODEL})
        self._send(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path != '/transcribe':
            return self._send(404, {'error': 'Not found'})
        length = int(self.headers.get('Content-Length') or 0)
        if not 0 < length <= MAX_BYTES:
            return self._send(413, {'error': 'Audio must be between 0 and 60 seconds'})
        rate = int(self.headers.get('X-Sample-Rate') or 16000)
        started = time.time()
        text = transcribe(to_float(self.rfile.read(length), rate))
        print(f'[stt] {length / 2 / rate:.1f}s audio -> {time.time() - started:.2f}s: {text[:80]!r}', flush=True)
        self._send(200, {'text': text})

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    started = time.time()
    transcribe(np.zeros(16000, dtype=np.float32))  # loads the model before the first real question
    print(f'[stt] ready on 127.0.0.1:{PORT} · {MODEL} · warm-up {time.time() - started:.1f}s', flush=True)
    sys.stdout.flush()
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
