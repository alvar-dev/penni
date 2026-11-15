/**
 * No on-device Kokoro in the browser: the web version streams Kokoro from the
 * server (GET /speak), or uses the browser's own voice (see useSpeaker.ts).
 */
export const KokoroEngine = null;
