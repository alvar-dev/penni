#!/usr/bin/env bash
# Deploys the API server to the resella VM: https://valmentaja.resella.fi
#
# On the VM it runs as the systemd service "valmentaja" from ~/valmentaja on
# 127.0.0.1:8790; Caddy (/etc/caddy/Caddyfile) terminates HTTPS. The VM keeps its
# own ~/valmentaja/.env (model key, app token, PORT=8790, HOST=127.0.0.1).
# Speech recognition is not needed there: the installed app recognises speech
# on the phone and the web version in the browser (src/hooks/deviceSpeech*.ts).
# The voice is: stt/server.py runs Kokoro (kokoro-onnx, no Whisper) for the web
# version and for the APK until its own Kokoro has downloaded. One-time setup:
#   cd ~/valmentaja/stt && python3 -m venv --without-pip .venv
#   curl -fsSL https://bootstrap.pypa.io/get-pip.py | .venv/bin/python
#   .venv/bin/pip install kokoro-onnx numpy
# The web version (scripts/build-web.sh -> dist/) is served from ~/valmentaja/web.
#
# The answer cache on the VM is kept; FRESH_CACHE=1 replaces it with the local
# one (after prompt or data changes).
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${DEPLOY_HOST:-resella}
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/server/data" "$STAGE/src/shared" "$STAGE/stt"
cp stt/server.py "$STAGE/stt/"
cp server/*.mts "$STAGE/server/"
cp server/data/*.json "$STAGE/server/data/"
cp src/shared/*.ts src/shared/package.json "$STAGE/src/shared/"
rsync -a "$STAGE/" "$HOST:valmentaja/"
rsync -a stt/models/ "$HOST:valmentaja/stt/models/"
# Sentences already spoken on the Mac (same voice), so cached answers are read at once.
if [ -d server/.cache/speech ]; then
  ssh "$HOST" 'mkdir -p valmentaja/server/.cache/speech'
  rsync -a --ignore-existing server/.cache/speech/ "$HOST:valmentaja/server/.cache/speech/"
fi
if [ -f dist/index.html ]; then
  rsync -a --delete dist/ "$HOST:valmentaja/web/"
fi

if [ -f server/.cache/answers.json ]; then
  ssh "$HOST" 'mkdir -p valmentaja/server/.cache'
  if [ "${FRESH_CACHE:-0}" = "1" ]; then
    rsync -a server/.cache/answers.json "$HOST:valmentaja/server/.cache/"
  else
    rsync -a --ignore-existing server/.cache/answers.json "$HOST:valmentaja/server/.cache/"
  fi
fi

ssh "$HOST" 'sudo systemctl restart valmentaja && sleep 2 && curl -fsS http://127.0.0.1:8790/health && echo'
echo "Deployed: https://valmentaja.resella.fi/health"
