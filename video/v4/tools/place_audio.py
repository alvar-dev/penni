"""Places the generated audio on the film's timeline (between the audio markers in index.html).

python3 -I tools/place_audio.py
Narration lines keep their planned start unless the previous line is still speaking; the music
ducks under every voice; sound effects sit on the visual events (same times as in index.html).
"""

import json
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
M = json.load(open(os.path.join(HERE, "assets", "audio", "manifest.json")))
T2, T3, T4, TL, TD, VID, TB, TO, END = 6.5, 14.5, 21.5, 31.0, 39.5, 48.0, 71.3, 78.3, 85.0

clips = []  # (id, src, start, duration, volume, fade_in, fade_out)
speech = []  # [start, end] of every voice, for ducking

# Narration
prev_end = 0.0
for lid in ["vo01", "vo02", "vo03", "vo04", "vo05", "vo05b", "vo06", "vo07", "vo08", "vo09", "vo10", "vo11", "vo12", "vo13", "vo14", "vo15"]:
    start = max(M[lid]["start"], prev_end + 0.25)
    dur = M[lid]["dur"]
    clips.append((lid, f"assets/audio/{lid}.mp3", start, dur, 1.78, 0, 0))
    speech.append([start, start + dur])
    prev_end = start + dur

# The user's spoken question and the app's own voice reading the answer
uq = VID + 2.7
clips.append(("user", "assets/audio/user-question.mp3", uq, M["user"]["dur"], 1.6, 0, 0))
speech.append([uq, uq + M["user"]["dur"]])
app0 = VID + 8.5
app_dur = min(M["app"][0]["dur"], (TB - 0.8) - app0)
clips.append(("app", "assets/audio/app-0.mp3", app0, round(app_dur, 2), 1.78, 0, 1.0))
speech.append([app0, app0 + app_dur])

# Sound effects, each normalised to its own level (measured RMS -> target RMS), so none jumps out.
import subprocess

def rms(path):
    out = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", "astats=metadata=0", "-f", "null", "-"], capture_output=True, text=True).stderr
    overall = out[out.rfind("Overall"):]
    for line in overall.splitlines():
        if "RMS level dB" in line:
            return float(line.split()[-1])
    return -20.0

TARGET = {"whoosh": -30, "swirl": -31, "bloom": -30, "scan": -34, "tick": -33, "pop": -32, "chime": -29, "split": -30, "slide": -30, "listen": -28, "connect": -30, "sting": -26}
GAIN = {k: round(min(3.5, 10 ** ((v - rms(os.path.join(HERE, "assets", "audio", f"sfx-{k}.mp3"))) / 20)), 3) for k, v in TARGET.items()}

def sfx(name, t, extra=1.0):
    clips.append((f"sfx-{name}-{len(clips)}", f"assets/audio/sfx-{name}.mp3", round(t, 3), M[f"sfx-{name}"]["dur"], round(GAIN[name] * extra, 3), 0, 0))

sfx("swirl", 2.6)
sfx("bloom", 5.0)
for t in (T2 - 0.5, T3 - 0.3, T4 - 0.4, TL - 0.8, TB - 1.0, TO - 0.5):
    sfx("whoosh", t)
sfx("scan", T2 + 1.2)
for i in range(0, 15, 2):
    cross = max(T2 + 1.0 + i * 0.12, T2 + 1.2 + (130 + i * 78 + 39 - 490) / 150)
    sfx("tick", cross + 0.9)
sfx("split", T3 + 0.5)
sfx("pop", T3 + 1.3)
sfx("pop", T3 + 1.9, 0.8)
sfx("tick", T3 + 3.9)
sfx("chime", T4 + 3.4)
for m in (1, 3, 5, 10):
    sfx("pop", TL + 0.9 + m / 11 * 6.2 + 0.05)
sfx("chime", TL + 0.9 + 6.2 + 0.05)
sfx("slide", TD)
for t in (TD + 3.4, TD + 6.1):
    sfx("tick", t)
sfx("listen", VID + 1.0)
for i in range(3):
    sfx("tick", VID + 9.4 + i * 1.6, 0.8)
sfx("connect", TB + 0.3)
sfx("connect", TB + 1.3, 0.8)
sfx("sting", TO + 0.3)

# Music, ducked under the voices
speech.sort()
merged = []
for s, e in speech:
    if merged and s <= merged[-1][1] + 0.6:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])
points = [{"t": 0, "v": 1}]
for s, e in merged:
    points += [{"t": round(max(0.01, s - 0.35), 2), "v": 1}, {"t": round(s, 2), "v": 0.55}, {"t": round(e, 2), "v": 0.55}, {"t": round(e + 0.45, 2), "v": 1}]
automation = json.dumps({"version": 1, "lanes": [{"target": "volume", "points": points}]}, separators=(",", ":")).replace('"', "&quot;")

lines = ["      <!-- audio:start -->"]
lines.append(f'      <audio id="music" src="assets/audio/music.mp3" data-start="0" data-duration="{END}" data-volume="0.28" data-fade-in="1.5" data-fade-out="3" data-track-index="10" data-automation="{automation}"></audio>')
for k, (cid, src, start, dur, vol, fi, fo) in enumerate(clips):
    track = 11 if cid.startswith(("vo", "user", "app")) else 12 + k % 6
    extra = (f' data-fade-in="{fi}"' if fi else "") + (f' data-fade-out="{fo}"' if fo else "")
    lines.append(f'      <audio id="a-{cid}" src="{src}" data-start="{start:.3f}" data-duration="{dur:.3f}" data-volume="{vol}" data-track-index="{track}"{extra}></audio>')
lines.append("      <!-- audio:end -->")
block = "\n".join(lines)

p = os.path.join(HERE, "index.html")
html = open(p).read()
if "<!-- audio:start -->" in html:
    html = re.sub(r"      <!-- audio:start -->.*?<!-- audio:end -->", lambda _: block, html, flags=re.S)
else:
    html = html.replace('      <canvas class="dust" id="dustFront"', block + '\n      <canvas class="dust" id="dustFront"', 1)
open(p, "w").write(html)
print(f"{len(clips)} clips placed; narration ends at {prev_end:.1f}s; music ducks {len(merged)} times")
for cid, src, start, dur, *_ in clips:
    if cid.startswith(("vo", "user", "app")):
        print(f"  {cid:5} {start:6.2f} → {start + dur:6.2f}")
