/**
 * An answer split into the sentences it is read in, so the one being read can
 * be highlighted. Splits after . ! ? followed by a space (so "€84.20" stays whole).
 */
export function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
