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
T2, T3, T4, TL, TD, VID, TB, TO, END = 6.5, 14.5, 21.5, 29.0, 37.5, 46.0, 69.3, 76.3, 83.0

clips = []  # (id, src, start, duration, volume, fade_in, fade_out)
speech = []  # [start, end] of every voice, for ducking

# Narration
prev_end = 0.0
for i in range(1, 16):
    lid = f"vo{i:02d}"
    start = max(M[lid]["start"], prev_end + 0.25)
    dur = M[lid]["dur"]
    clips.append((lid, f"assets/audio/{lid}.mp3", start, dur, 1.78, 0, 0))
    speech.append([start, start + dur])
    prev_end = start + dur

# The user's spoken question and the app's own voice reading the answer
uq = 48.7
clips.append(("user", "assets/audio/user-question.mp3", uq, M["user"]["dur"], 1.6, 0, 0))
speech.append([uq, uq + M["user"]["dur"]])
app0 = VID + 8.5
app_dur = min(M["app"][0]["dur"], (TB - 0.8) - app0)
clips.append(("app", "assets/audio/app-0.mp3", app0, round(app_dur, 2), 1.78, 0, 1.0))
speech.append([app0, app0 + app_dur])

# Sound effects
def sfx(name, t, vol):
    clips.append((f"sfx-{name}-{len(clips)}", f"assets/audio/sfx-{name}.mp3", round(t, 3), M[f"sfx-{name}"]["dur"], vol, 0, 0))

sfx("bloom", 5.0, 0.22)
for t in (T3 - 0.3, TL - 0.7, TB - 0.9):
    sfx("whoosh", t, 0.16)
sfx("slide", TD, 0.18)
sfx("listen", VID + 1.0, 0.28)
sfx("sting", TO + 0.3, 0.26)

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
