#!/usr/bin/env bash
# Builds the web version into dist/ (served by the API server from ~/valmentaja/web
# on the VM; see scripts/deploy-resella.sh). The API is the hosted one unless
# EXPO_PUBLIC_API_URL says otherwise.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-https://valmentaja.resella.fi} npx expo export -p web
# Skia's CanvasKit (WebAssembly), loaded from the site root by index.ts.
cp node_modules/canvaskit-wasm/bin/full/canvaskit.wasm dist/
# Page title, a loading state while CanvasKit downloads, and a phone-width
# column on wide screens (the app is designed for phones).
python3 -I - dist/index.html <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('<title>Junction S-Pankki</title>', """<title>Penni · every euro, understood</title>
    <meta name="description" content="A money coach you can talk to. A Junction 2026 demo on S-Pankki's synthetic dataset." />
    <meta name="theme-color" content="#f4f7f3" />""")
s = s.replace('</style>', """  html, body { background: #e7ede8; }
      #root { max-width: 440px; width: 100%; margin: 0 auto; background: #f4f7f3; position: relative; overflow: hidden;
              -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
      #root input, #root textarea { -webkit-user-select: text; user-select: text; }
      #root input:focus, #root textarea:focus { outline: none; }
      html, body { margin: 0; }
      @media (min-width: 600px) {
        #root { height: min(100%, 920px); margin-top: max(0px, calc((100vh - 920px) / 2)); border-radius: 28px;
                box-shadow: 0 30px 80px rgba(12, 58, 34, 0.18), 0 0 0 1px rgba(16, 60, 36, 0.08); }
      }
      .boot { margin: auto; text-align: center; font: 600 28px -apple-system, system-ui, sans-serif; color: #004628; letter-spacing: -0.02em; }
      .boot span { display: block; margin-top: 10px; font-weight: 400; font-size: 15px; color: #6d736f; letter-spacing: 0; }
    </style>""", 1)
s = s.replace('<div id="root"></div>', '<div id="root"><div class="boot">Penni<span>Loading…</span></div></div>')
open(p, 'w').write(s)
PY
echo "Built: dist/"
