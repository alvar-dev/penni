"""Local speech for the app: Whisper large-v3-turbo (MLX) to hear questions, Kokoro to read answers.

Started by the API server (server/index.mts); it is not meant to be reached
from the network, so it listens on 127.0.0.1 only.

    POST /transcribe   body: raw 16-bit little-endian mono PCM
                       header X-Sample-Rate (default 16000)
                       -> {"text": "..."}
    POST /speak        body: {"text": "..."} -> audio/wav (Kokoro, af_heart, 24 kHz)
                       only when stt/models holds the Kokoro files (for Expo Go;
                       the installed app runs Kokoro on the phone itself)
    GET  /health       -> {"ok": true, "tts": bool}

Audio never leaves this computer. The model loads once and stays in memory.
"""
import io
import json
import os
import re
import sys
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import mlx_whisper
import numpy as np

MODEL = os.environ.get('STT_MODEL', 'mlx-community/whisper-large-v3-turbo')
LANGUAGE = os.environ.get('STT_LANGUAGE', 'fi')
PORT = int(os.environ.get('STT_PORT', '8788'))
MAX_BYTES = 16000 * 2 * 60  # one minute of 16 kHz audio

# Whisper's well-known inventions on near-silent input (cf. ~/Programming/jari).
# What Whisper says when it hears silence or noise, in Finnish and English.
JUNK = {'', '.', '..', '...', 'kiitos', 'kiitos.', 'kiitos!', 'hyvää', 'tekstitys yle', 'yle', 'kiitos katsomisesta.', 'kiitos kun katsoit.',
        'you', 'you.', 'thank you.', 'thank you', 'thanks for watching!', 'thanks for watching.', 'bye.', 'bye!'}

lock = Lock()  # one transcription at a time; MLX work is not worth interleaving

# Kokoro, if its model files are present (same quantized model the phone uses).
MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
VOICE = os.environ.get('TTS_VOICE', 'af_heart')
kokoro = None
try:
    from kokoro_onnx import Kokoro
    if os.path.exists(os.path.join(MODELS, 'kokoro-v1.0.int8.onnx')):
        kokoro = Kokoro(os.path.join(MODELS, 'kokoro-v1.0.int8.onnx'), os.path.join(MODELS, 'voices-v1.0.bin'))
except Exception as error:  # the app falls back to the phone's own voice
    print(f'[stt] Kokoro unavailable: {error}', flush=True)
speak_lock = Lock()


def speak(text: str) -> bytes:
    """Reads the text with Kokoro and returns a 16-bit mono WAV."""
    with speak_lock:
        samples, rate = kokoro.create(text, voice=VOICE, speed=1.0, lang='en-us' if LANGUAGE == 'en' else 'fi')
    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes()
    out = io.BytesIO()
    with wave.open(out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return out.getvalue()


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
            return self._send(200, {'ok': True, 'model': MODEL, 'tts': kokoro is not None})
        self._send(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path == '/speak':
            return self._speak()
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

    def _speak(self):
        if kokoro is None:
            return self._send(503, {'error': 'No voice model'})
        length = int(self.headers.get('Content-Length') or 0)
        if not 0 < length <= 20000:
            return self._send(413, {'error': 'Text too long'})
        text = (json.loads(self.rfile.read(length) or b'{}').get('text') or '').strip()[:1500]
        if not text:
            return self._send(400, {'error': 'text is required'})
        started = time.time()
        data = speak(text)
        print(f'[tts] {len(text)} chars -> {time.time() - started:.2f}s', flush=True)
        self.send_response(200)
        self.send_header('Content-Type', 'audio/wav')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    started = time.time()
    transcribe(np.zeros(16000, dtype=np.float32))  # loads the model before the first real question
    print(f'[stt] ready on 127.0.0.1:{PORT} · {MODEL} · voice {VOICE if kokoro else "off"} · warm-up {time.time() - started:.1f}s', flush=True)
    sys.stdout.flush()
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
