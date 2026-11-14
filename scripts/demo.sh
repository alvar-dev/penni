#!/bin/bash
# Demo mode for the iOS simulator:
#  - the API server (with local Whisper), pre-warming answers to the start
#    screen's questions for the demo customer so they come back instantly;
#  - Expo on localhost, so changing Wi-Fi or losing the network does not
#    break the connection between the simulator and this computer.
# EXPO_OFFLINE=1 stops Expo making network requests of its own.
# Only the language model needs the internet; cached answers do not.
cd "$(dirname "$0")/.." || exit 1
DEMO_PREWARM=1 npm run server &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
EXPO_OFFLINE=1 npx expo start --ios --host localhost
