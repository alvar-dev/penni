/**
 * The server's language: APP_LANG=fi or en (default en). It must match the
 * app's setting in src/lang.ts, or answers and labels mix languages.
 */
export const LANG: 'fi' | 'en' = process.env.APP_LANG === 'fi' ? 'fi' : 'en';
export const EN = LANG === 'en';

/** The text for the server's language. */
export const tr = <T,>(fi: T, en: T): T => (EN ? en : fi);

/** 1234 -> "1,234" (English) or "1 234" (Finnish). */
export const thousands = (v: number): string => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, EN ? ',' : ' ');

/** Whole euros: "€1,234" or "1 234 €". */
export const euros = (v: number): string => (EN ? `€${thousands(v)}` : `${thousands(v)} €`);
