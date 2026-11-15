# Penni — every euro, understood

A money coach you can talk to. Penni sorts every euro of your own transactions into three baskets, learns from your spending over time, and answers your questions — by voice or text — with a plain-words answer and a chart, in about three seconds.

Built at **Junction 2026** for the **S-Pankki: Personal Economic Trainer** challenge, on S-Pankki's synthetic transaction dataset. Penni is a standalone demo, not part of S-mobiili.

## What it does

- **Three baskets.** Every transaction is sorted into *essentials* (rent, groceries, bills, transport), *surprises* (a broken washing machine, the dentist) and *extras* (coffee, taxis, shopping). The start screen shows where an average month goes.
- **Teaches with your own money.** Patterns become lessons and lessons become a plan: one €1,008 surprise meant ten days overdrawn, so Penni suggests setting aside €125 every payday — and shows how that would have played out.
- **A home screen that changes with you.** The tiles pick what matters now: room until payday, a spending spike, your discretionary share, your top everyday cost.
- **Ask anything.** Tap the orb and speak, or type. The model picks one calculation, the server computes it from your transactions, and the model words a 2–3 sentence answer from those facts only. Every number comes from code, never from the model. Ask for "another chart" and it redraws.
- **Benchmarks from Statistics Finland.** Answers compare you with people your age using open data from the StatFin PxWeb API (household budget survey, price index, rents, income), and cite the source.
- **Every bank, one coach.** Connect other banks (OP, Nordea, Danske, Revolut, Handelsbanken, Aktia, Säästöpankki, POP, Oma Säästöpankki, Ålandsbanken) and Penni reasons over the whole picture — for example, paying a credit card from savings. Other banks' data is generated for the demo.
- **Reads answers aloud.** Kokoro (af_heart) speaks the answer sentence by sentence while the sentence being read is highlighted; the voice can be muted.

## How it works

```
App (Expo / React Native)  ──question──▶  API server (Node)
   voice → speech-to-text                     │ 1. LLM picks one tool (tool calling)
   Skia orb, charts, read-along               │ 2. calculation engine runs it on the customer's transactions
                                              │ 3. LLM words the answer from the facts only
                                              ▼
                                   Featherless · Kimi K3 (open-weight)
```

- Only computed summaries reach the model, never raw transactions. The model is open-weight, so it can be hosted in the EU next to the bank's data.
- Around 3 s and 2 cents per answer (low reasoning effort); common questions are cached.
- Speech to text: the phone's on-device recognizer in the app build; local Whisper (mlx) on a Mac in development.
- Text to speech: Kokoro on the device (react-native-executorch); Kokoro on the Mac for Expo Go.

## Tech

Expo SDK 58 · React Native 0.88 · TypeScript · Skia · Reanimated · expo-speech-recognition · react-native-executorch (Kokoro) · react-native-audio-api · Node (type-stripped TypeScript) · Featherless API (Kimi K3, tool calling) · Statistics Finland PxWeb API · mlx-whisper · kokoro-onnx. Demo video: HyperFrames (HTML/GSAP/WebGL) with ElevenLabs narration and music.

## Run it

```bash
npm install
cp .env.example .env.local        # FEATHERLESS_API_KEY, FEATHERLESS_MODEL, EXPO_PUBLIC_API_TOKEN
npm run server                    # API on :8787 (also starts local Whisper/Kokoro if set up in stt/)
npx expo start                    # open in Expo Go or a development build
```

The data comes from [hackjunction/Junction-2026-S-pankki](https://github.com/hackjunction/Junction-2026-S-pankki): `python3 -I tools/prepare_data.py <raw dir> server/data` builds `server/data/personas.json`; `python3 -I tools/fetch_finland.py server/data/finland.json` refreshes the Statistics Finland snapshot.

## Repository

- `App.tsx`, `src/` — the app (screens, charts, voice in and out, bank connection)
- `server/` — API, calculation engine (`engine.mts`), model calls (`llm.mts`), Statistics Finland comparisons (`finland.mts`)
- `stt/` — local Whisper and Kokoro for development
- `video/v4/` — the demo video as a HyperFrames composition
