"""Makes the film's audio: narration, the user's question, the app's own voice, music and sound effects.

python3 -I tools/make_audio.py [vo|user|app|music|sfx|all]
Needs ELEVENLABS_API_KEY in video/v4/.env and, for the app's voice, the local API server (npm run server).
Writes assets/audio/*.mp3 and assets/audio/manifest.json (durations).
"""

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "assets", "audio")
os.makedirs(OUT, exist_ok=True)
ENV = dict(line.strip().split("=", 1) for line in open(os.path.join(HERE, ".env")) if "=" in line)
KEY = ENV["ELEVENLABS_API_KEY"]
API = "https://api.elevenlabs.io/v1"

NARRATOR = "nPczCjzI2devNBz1zQrb"  # Brian
USER = "bIHbv24MWmeRgasZH58o"  # Will

# id, start (s), text — the start times follow the scene times in index.html.
LINES = [
    ("vo01", 0.6, "Every day, money moves in a hundred small directions."),
    ("vo02", 4.0, "Meet Penni: a money coach that explains where it all goes."),
    ("vo03", 7.0, "Penni reads your own transactions, and sorts every euro into three baskets:"),
    ("vo04", 11.4, "what you have to pay, what surprises you, and what you choose."),
    ("vo05", 15.5, "So you can see where an average month really goes."),
    ("vo06", 21.9, "Over a year, patterns start to show."),
    ("vo07", 24.5, "One washing machine in July meant ten days overdrawn."),
    ("vo08", 27.2, "Surprises are predictable. Extras are yours to steer."),
    ("vo09", 29.8, "And Penni keeps learning as you spend."),
    ("vo10", 32.0, "It turns patterns into lessons, and lessons into a plan: a hundred and twenty-five euros, every payday."),
    ("vo11", 38.6, "Your home screen changes with you."),
    ("vo12", 41.3, "Payday, a spike, a new habit: what matters now comes first."),
    ("vo13", 46.1, "And when you have a question, just ask."),
    ("vo14", 69.7, "Connect your other banks, and Penni sees the whole picture."),
    ("vo15", 77.2, "Penni. Every euro, understood."),
]

MUSIC_PROMPT = (
    "Calm, elegant corporate background music for a modern fintech product film. Soft felt piano motif, warm "
    "airy pads, a light pulsing synth arpeggio, gentle modern percussion entering after about twenty seconds, "
    "a slow hopeful build in the middle, trustworthy and optimistic, clean and minimal, no vocals, around 92 BPM. "
    "It settles down near the end and resolves on a soft warm chord."
)

SFX = [
    ("swirl", 3.0, "soft airy whoosh swirling inward with a faint magical shimmer, gentle and subtle"),
    ("bloom", 1.6, "soft warm low bloom impact with a gentle shimmering tail, subtle cinematic"),
    ("whoosh", 1.0, "short soft clean transition whoosh, modern minimal user interface"),
    ("scan", 5.0, "subtle soft digital scanner sweep, light electronic hum, minimal"),
    ("tick", 0.5, "very soft short user interface tick, minimal click"),
    ("pop", 0.5, "soft gentle bubbly pop, user interface element appearing"),
    ("chime", 1.4, "soft bright warm notification chime, positive, minimal"),
    ("split", 1.4, "soft liquid blob stretching and splitting into drops, gentle gooey"),
    ("slide", 1.2, "smooth soft swoosh of a phone sliding into frame"),
    ("listen", 0.9, "soft rising tone, voice assistant starts listening"),
    ("sting", 3.5, "warm soft cinematic logo sting, gentle piano chord with a light shimmer"),
]


def post(path, body, out):
    req = urllib.request.Request(f"{API}{path}", data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r, open(out, "wb") as f:
            f.write(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{path}: HTTP {e.code} {e.read()[:400]!r}")


def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]).strip())


def tts(voice, text, out, stability=0.6, style=0.1):
    post(f"/text-to-speech/{voice}?output_format=mp3_44100_128",
         {"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": stability, "similarity_boost": 0.8, "style": style, "use_speaker_boost": True}}, out)


manifest_path = os.path.join(OUT, "manifest.json")
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
what = sys.argv[1] if len(sys.argv) > 1 else "all"

if what in ("vo", "all"):
    for lid, start, text in LINES:
        out = os.path.join(OUT, f"{lid}.mp3")
        tts(NARRATOR, text, out)
        manifest[lid] = {"start": start, "dur": round(duration(out), 3), "text": text}
        print(lid, manifest[lid]["dur"], "s")

if what in ("user", "all"):
    out = os.path.join(OUT, "user-question.mp3")
    tts(USER, "What kind of spender am I?", out, stability=0.45, style=0.2)
    manifest["user"] = {"dur": round(duration(out), 3)}
    print("user", manifest["user"]["dur"], "s")

if what in ("app", "all"):
    # The app's own voice: the cached answer, read by Kokoro (af_heart) exactly as the app does.
    env_local = dict(line.strip().split("=", 1) for line in open(os.path.join(HERE, "..", "..", ".env.local")) if "=" in line)
    token = env_local["EXPO_PUBLIC_API_TOKEN"]
    req = urllib.request.Request("http://127.0.0.1:8787/ask", data=json.dumps({"personaId": "CUST03915", "question": "What kind of spender am I?", "history": [], "banks": ["nordea"]}).encode(),
                                 headers={"Content-Type": "application/json", "X-App-Token": token})
    text = json.load(urllib.request.urlopen(req, timeout=120))["text"]
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())

    def speakable(s):
        s = re.sub(r"(\d),(\d{1,2})(?!\d)", r"\1.\2", s)
        s = s.replace("−", "minus ")
        s = re.sub(r"€\s?(\d[\d,. ]*\d|\d)", lambda m: f"{m.group(1)} euros", s)
        s = re.sub(r"(\d)[\s ]?€", r"\1 euros", s)
        s = re.sub(r"(\d)[\s ]?%", r"\1 percent", s)
        return re.sub(r"\s+", " ", s).strip()

    parts = []
    for i, sent in enumerate(sentences[:2]):
        wav = os.path.join(OUT, f"app-{i}.wav")
        url = "http://127.0.0.1:8787/speak?" + urllib.parse.urlencode({"text": speakable(sent), "token": token})
        with urllib.request.urlopen(url, timeout=120) as r, open(wav, "wb") as f:
            f.write(r.read())
        mp3 = os.path.join(OUT, f"app-{i}.mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-b:a", "160k", mp3], check=True)
        os.remove(wav)
        parts.append({"file": f"app-{i}.mp3", "dur": round(duration(mp3), 3), "text": sent})
        print("app", i, parts[-1]["dur"], "s |", sent[:70])
    manifest["app"] = parts

if what in ("music", "all"):
    out = os.path.join(OUT, "music.mp3")
    post("/music", {"prompt": MUSIC_PROMPT, "music_length_ms": 84000, "model_id": "music_v1", "force_instrumental": True}, out)
    manifest["music"] = {"dur": round(duration(out), 3)}
    print("music", manifest["music"]["dur"], "s")

if what in ("sfx", "all"):
    for sid, dur, text in SFX:
        out = os.path.join(OUT, f"sfx-{sid}.mp3")
        if os.path.exists(out) and os.path.getsize(out) > 1000 and f"sfx-{sid}" in manifest:
            continue
        post("/sound-generation", {"text": text, "duration_seconds": dur, "prompt_influence": 0.55}, out)
        manifest[f"sfx-{sid}"] = {"dur": round(duration(out), 3)}
        print("sfx", sid, manifest[f"sfx-{sid}"]["dur"], "s")

json.dump(manifest, open(manifest_path, "w"), indent=1, ensure_ascii=False)
